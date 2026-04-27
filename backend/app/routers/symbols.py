"""Symbol endpoints: search, lookup, seed from Alpaca."""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import cast

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import and_, func, or_

from app.config import get_config
from app.db import db_session
from app.db.models import Symbol
from app.db.redis import RedisClient, get_redis
from app.rate_limit import get_alpaca_limiter

logger = logging.getLogger(__name__)
router = APIRouter()

# cached search results expire after 5 minutes
SEARCH_CACHE_TTL = 300


def _tradable_filter():
    """Symbols we expose to end users: tradable, and for crypto, USD-denominated
    pairs only. Non-USD crypto pairs (e.g. ETH/BTC, BCH/USDC, LTC/USDT) are
    hidden from search, trending, and other discovery surfaces because the
    app only supports USD-denominated crypto trading."""
    return and_(
        Symbol.tradable,
        or_(
            Symbol.asset_class != "crypto",
            Symbol.ticker.like("%/USD"),
        ),
    )


def _alpaca_headers(config=None) -> dict[str, str]:
    if config is None:
        config = get_config()
    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise HTTPException(status_code=500, detail="Alpaca API keys not configured")
    return {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }


def _has_alpaca_credentials(config=None) -> bool:
    if config is None:
        config = get_config()
    key = (config.alpaca_api_key or "").strip()
    secret = (config.alpaca_secret_key or "").strip()
    return key not in {"", "your_alpaca_key_here"} and secret not in {
        "",
        "your_alpaca_secret_here",
    }


def _symbol_to_dict(s: Symbol) -> dict:
    return {
        "ticker": s.ticker,
        "name": s.name,
        "exchange": s.exchange,
        "asset_class": s.asset_class,
        "tradable": s.tradable,
        "fractionable": s.fractionable,
    }


@router.get("/symbols")
async def list_symbols(
    q: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """Paginated symbol list optionally filtered by `q` (ticker prefix or name substring), returning `{ items, has_more, total }`."""
    q_norm = (q or "").strip().upper()

    with db_session() as db:
        query = db.query(Symbol).filter(Symbol.tradable)
        if q_norm:
            query = query.filter(
                or_(
                    Symbol.ticker.ilike(f"{q_norm}%"),
                    Symbol.name.ilike(f"%{q_norm}%"),
                ),
            )

        total = query.count()

        if q_norm:
            ordering = (
                (Symbol.ticker != q_norm).asc(),
                (Symbol.ticker.ilike(f"{q_norm}%")).desc(),
                Symbol.ticker.asc(),
            )
        else:
            ordering = (Symbol.ticker.asc(),)

        rows = (
            query.order_by(*ordering).offset(offset).limit(limit).all()
        )
        items = [_symbol_to_dict(s) for s in rows]

    return {
        "items": items,
        "has_more": offset + len(items) < total,
        "total": total,
    }


@router.get("/symbols/search")
async def search_symbols(q: str = Query(..., min_length=1)):
    """Search local symbol table by ticker prefix or name substring.
    Results are cached in Redis with a TTL so repeated queries are instant.
    """
    q = q.strip().upper()
    cache_key = f"symbol_search:{q}"

    # try Redis cache first
    redis: RedisClient = await get_redis()
    cached = await redis.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    # cache miss — query Postgres
    with db_session() as db:
        results = (
            db.query(Symbol)
            .filter(
                _tradable_filter(),
                or_(
                    Symbol.ticker.ilike(f"{q}%"),
                    Symbol.name.ilike(f"%{q}%"),
                ),
            )
            .order_by(
                # exact match first, then ticker-prefix, then name-substring
                (Symbol.ticker != q).asc(),
                (~Symbol.ticker.ilike(f"{q}%")).asc(),
                Symbol.ticker.asc(),
            )
            .limit(5)
            .all()
        )
        data = [_symbol_to_dict(s) for s in results]

    # write to Redis with TTL — key auto-expires, no manual cleanup needed
    await redis.set(cache_key, json.dumps(data), ex=SEARCH_CACHE_TTL)

    return data


TRENDING_KEY_PREFIX = "symbol_trending"
TRENDING_LIMIT = 5
# How deep we read into each weekly bucket before merging — large enough that
# the union across two weeks comfortably covers TRENDING_LIMIT even after the
# asset_class filter knocks some entries out, small enough that the read stays
# cheap.
TRENDING_BUCKET_READ = 20


def _trending_key(d: datetime) -> str:
    """Return the per-ISO-week key the trending zset lives under.

    Rotating weekly keeps the leaderboard recency-weighted (last quarter's
    surge can't dominate this week) and lets per-key TTLs auto-prune the
    history without a manual sweep.
    """
    year, week, _ = d.isocalendar()
    return f"{TRENDING_KEY_PREFIX}:{year}-W{week:02d}"


def _trending_keys_for_read() -> list[str]:
    """Current week + previous week. We read both so a Monday morning lookup
    isn't empty just because the new bucket has barely been written to yet."""
    now = datetime.now(timezone.utc)
    return [_trending_key(now), _trending_key(now - timedelta(days=7))]


@router.post("/symbols/track")
async def track_symbol(
    ticker: str = Query(..., min_length=1),
):
    """Increment the trending score for a ticker when a user selects it."""
    ticker = ticker.strip().upper()
    redis: RedisClient = await get_redis()
    key = _trending_key(datetime.now(timezone.utc))
    new_score = await redis.zincrby(key, 1, ticker)
    # Refresh the bucket TTL on every write so the current week stays alive
    # while quiescent older buckets age out automatically.
    await redis.expire(key, get_config().trending_key_ttl_seconds)
    logger.info("Symbol tracked: %s (score=%.0f, bucket=%s)", ticker, new_score, key)
    return {"ok": True}


@router.get("/symbols/trending")
async def trending_symbols(asset_class: str | None = Query(default=None)):
    """Return up to 10 symbols: trending first, backfilled with random tradable ones.

    Optional `asset_class` filter (e.g. `us_equity` or `crypto`) scopes both the
    trending list and the backfill so crypto accounts get crypto suggestions.
    """
    if asset_class is not None and asset_class not in ("us_equity", "crypto"):
        raise HTTPException(status_code=400, detail="Invalid asset_class")

    redis: RedisClient = await get_redis()
    merged_scores: dict[str, float] = {}
    for key in _trending_keys_for_read():
        items = cast(
            list[tuple[str, float]],
            await redis.zrevrange(key, 0, TRENDING_BUCKET_READ - 1, withscores=True),
        )
        for ticker, score in items:
            merged_scores[ticker] = merged_scores.get(ticker, 0.0) + float(score)
    top_tickers = sorted(
        merged_scores, key=lambda t: merged_scores[t], reverse=True
    )[:TRENDING_LIMIT]

    with db_session() as db:
        results: list[dict] = []
        used_tickers: set[str] = set()

        # resolve trending tickers from Redis, preserving score order
        if top_tickers:
            query = db.query(Symbol).filter(
                Symbol.ticker.in_(top_tickers), _tradable_filter()
            )
            if asset_class:
                query = query.filter(Symbol.asset_class == asset_class)
            symbols = query.all()
            by_ticker = {s.ticker: s for s in symbols}
            for t in top_tickers:
                if t in by_ticker:
                    results.append(_symbol_to_dict(by_ticker[t]))
                    used_tickers.add(t)

        # backfill remaining slots with random tradable symbols
        remaining = TRENDING_LIMIT - len(results)
        if remaining > 0:
            query = db.query(Symbol).filter(
                _tradable_filter(),
                Symbol.asset_class == (asset_class or "us_equity"),
            )
            # exclude tickers already in the trending list
            if used_tickers:
                query = query.filter(~Symbol.ticker.in_(used_tickers))
            backfill = query.order_by(func.random()).limit(remaining).all()
            results.extend(_symbol_to_dict(s) for s in backfill)

        return results


@router.get("/symbols/{ticker}")
async def get_symbol(ticker: str):
    """Get a single symbol from local DB."""
    ticker = ticker.upper().strip()
    with db_session() as db:
        s = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if not s:
            raise HTTPException(status_code=404, detail=f"Symbol {ticker} not found")
        return _symbol_to_dict(s)


@router.put("/symbols/{ticker}")
async def fetch_and_upsert_symbol(
    ticker: str,
):
    """
    Fetch a single symbol from Alpaca by exact ticker and upsert into local DB.
    Called by the frontend when a symbol isn't in the local table yet.
    """
    ticker = ticker.upper().strip()
    config = get_config()

    # Check if already exists
    with db_session() as db:
        existing = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if existing:
            return _symbol_to_dict(existing)

    # fetch from Alpaca if not in local DB
    await get_alpaca_limiter().acquire()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{config.alpaca_base_url}/v2/assets/{ticker}",
                headers=_alpaca_headers(config),
            )
            if res.status_code == 404:
                raise HTTPException(
                    status_code=404, detail=f"Symbol {ticker} not found on Alpaca"
                )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=503, detail=f"Alpaca request failed: {exc.response.status_code}"
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca request failed: {exc}")

    asset = res.json()
    now = datetime.now(timezone.utc)

    with db_session() as db:
        existing = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if existing:
            existing.name = asset.get("name", "")
            existing.exchange = asset.get("exchange")
            existing.asset_class = asset.get("class", "us_equity")
            existing.tradable = asset.get("tradable", True)
            existing.fractionable = asset.get("fractionable", False)
            existing.updated_at = now
        else:
            db.add(
                Symbol(
                    ticker=asset.get("symbol", ticker),
                    name=asset.get("name", ""),
                    exchange=asset.get("exchange"),
                    asset_class=asset.get("class", "us_equity"),
                    tradable=asset.get("tradable", True),
                    fractionable=asset.get("fractionable", False),
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()
        s = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        return _symbol_to_dict(s)


async def sync_symbols_from_alpaca() -> dict[str, int]:
    """
    Bulk fetch all tradable assets from Alpaca and upsert into symbol table.
    """
    config = get_config()
    headers = _alpaca_headers(config)

    await get_alpaca_limiter().acquire()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            stocks_res, crypto_res = await asyncio.gather(
                client.get(
                    f"{config.alpaca_base_url}/v2/assets",
                    params={"status": "active", "asset_class": "us_equity"},
                    headers=headers,
                ),
                client.get(
                    f"{config.alpaca_base_url}/v2/assets",
                    params={"status": "active", "asset_class": "crypto"},
                    headers=headers,
                ),
            )
            stocks_res.raise_for_status()
            crypto_res.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca bulk fetch failed: {exc}")

    assets = stocks_res.json() + crypto_res.json()
    tradable = [a for a in assets if a.get("tradable", False)]

    now = datetime.now(timezone.utc)
    count = 0
    inserted = 0
    updated = 0
    seen_tickers: set[str] = set()

    with db_session() as db:
        existing_tickers = {row[0] for row in db.query(Symbol.ticker).all()}

        for asset in tradable:
            t = asset.get("symbol", "")
            if not t:
                continue
            seen_tickers.add(t)

            if t in existing_tickers:
                db.query(Symbol).filter(Symbol.ticker == t).update(
                    {
                        "name": asset.get("name", ""),
                        "exchange": asset.get("exchange"),
                        "asset_class": asset.get("class", "us_equity"),
                        "tradable": asset.get("tradable", True),
                        "fractionable": asset.get("fractionable", False),
                        "updated_at": now,
                    }
                )
                updated += 1
            else:
                db.add(
                    Symbol(
                        ticker=t,
                        name=asset.get("name", ""),
                        exchange=asset.get("exchange"),
                        asset_class=asset.get("class", "us_equity"),
                        tradable=asset.get("tradable", True),
                        fractionable=asset.get("fractionable", False),
                        created_at=now,
                        updated_at=now,
                    )
                )
                inserted += 1
            count += 1

        deactivated = 0
        if seen_tickers:
            deactivated = (
                db.query(Symbol)
                .filter(Symbol.tradable, ~Symbol.ticker.in_(seen_tickers))
                .update(
                    {"tradable": False, "updated_at": now},
                    synchronize_session=False,
                )
            )

        db.commit()

    logger.info(
        "Synced %d symbols from Alpaca (%d inserted, %d updated, %d deactivated)",
        count,
        inserted,
        updated,
        deactivated,
    )
    return {
        "count": count,
        "inserted": inserted,
        "updated": updated,
        "deactivated": deactivated,
    }


async def sync_symbols_if_needed() -> None:
    config = get_config()
    if not config.symbol_seed_on_startup:
        logger.info("Symbol startup seed disabled")
        return

    try:
        with db_session() as db:
            count = db.query(func.count(Symbol.ticker)).scalar() or 0
    except Exception:
        logger.exception("Unable to check symbol table for startup seed")
        return

    if count > 0:
        logger.info("Symbol table already has %d rows; skipping startup seed", count)
        return

    if not _has_alpaca_credentials(config):
        logger.warning("Skipping symbol startup seed: Alpaca credentials not configured")
        return

    logger.info("Symbol table is empty; seeding from Alpaca")
    try:
        await sync_symbols_from_alpaca()
    except Exception:
        logger.exception("Symbol startup seed failed")


async def run_symbol_sync_loop() -> None:
    await sync_symbols_if_needed()

    config = get_config()
    interval = config.symbol_seed_refresh_interval_seconds
    if interval <= 0:
        logger.info("Periodic symbol sync disabled")
        return

    while True:
        await asyncio.sleep(interval)
        if not _has_alpaca_credentials():
            logger.warning("Skipping periodic symbol sync: Alpaca credentials not configured")
            continue
        try:
            result = await sync_symbols_from_alpaca()
            logger.info("Periodic symbol sync complete: %d symbols", result["count"])
        except Exception:
            logger.exception("Periodic symbol sync failed")


@router.post("/symbols/seed")
async def seed_symbols():
    """Manual symbol sync endpoint. Disabled unless explicitly enabled."""
    config = get_config()
    if not config.allow_symbol_seed_endpoint:
        raise HTTPException(status_code=404, detail="Not found")
    return await sync_symbols_from_alpaca()
