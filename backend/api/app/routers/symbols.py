"""Symbol endpoints: search, lookup, seed from Alpaca."""

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_

from app.config import get_config
from app.db import db_session
from app.db.models import Symbol
from app.db.redis import get_redis
from app.rate_limit import get_alpaca_limiter

logger = logging.getLogger(__name__)
router = APIRouter()

# cached search results expire after 5 minutes
SEARCH_CACHE_TTL = 300


def _alpaca_headers(config=None) -> dict[str, str]:
    if config is None:
        config = get_config()
    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise HTTPException(status_code=500, detail="Alpaca API keys not configured")
    return {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
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


@router.get("/symbols/search")
async def search_symbols(q: str = Query(..., min_length=1)):
    """Search local symbol table by ticker prefix or name substring.
    Results are cached in Redis with a TTL so repeated queries are instant.
    """
    q = q.strip().upper()
    cache_key = f"symbol_search:{q}"

    # try Redis cache first
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    # cache miss — query Postgres
    with db_session() as db:
        results = (
            db.query(Symbol)
            .filter(
                Symbol.tradable == True,
                or_(
                    Symbol.ticker.ilike(f"{q}%"),
                    Symbol.name.ilike(f"%{q}%"),
                ),
            )
            .order_by(
                # exact match first, then prefix, then name contains
                (Symbol.ticker != q).asc(),
                Symbol.ticker.asc(),
            )
            .limit(5)
            .all()
        )
        data = [_symbol_to_dict(s) for s in results]

    # write to Redis with TTL — key auto-expires, no manual cleanup needed
    await redis.set(cache_key, json.dumps(data), ex=SEARCH_CACHE_TTL)

    return data


TRENDING_KEY = "symbol_trending"
TRENDING_LIMIT = 5


@router.post("/symbols/track")
async def track_symbol(ticker: str = Query(..., min_length=1)):
    """Increment the trending score for a ticker when a user selects it."""
    ticker = ticker.strip().upper()
    redis = await get_redis()
    new_score = await redis.zincrby(TRENDING_KEY, 1, ticker)
    logger.info("Symbol tracked: %s (score=%.0f)", ticker, new_score)
    return {"ok": True}


@router.get("/symbols/trending")
async def trending_symbols():
    """Return up to 10 symbols: trending first, backfilled with random tradable ones."""
    redis = await get_redis()
    top_tickers = await redis.zrevrange(TRENDING_KEY, 0, TRENDING_LIMIT - 1)

    with db_session() as db:
        results: list[dict] = []
        used_tickers: set[str] = set()

        # resolve trending tickers from Redis, preserving score order
        if top_tickers:
            symbols = (
                db.query(Symbol)
                .filter(Symbol.ticker.in_(top_tickers), Symbol.tradable == True)
                .all()
            )
            by_ticker = {s.ticker: s for s in symbols}
            for t in top_tickers:
                if t in by_ticker:
                    results.append(_symbol_to_dict(by_ticker[t]))
                    used_tickers.add(t)

        # backfill remaining slots with random tradable symbols
        remaining = TRENDING_LIMIT - len(results)
        if remaining > 0:
            query = db.query(Symbol).filter(
                Symbol.tradable == True,
                Symbol.asset_class == "us_equity",
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
async def fetch_and_upsert_symbol(ticker: str):
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


@router.post("/symbols/seed")
async def seed_symbols():
    """
    Bulk fetch all tradable assets from Alpaca and upsert into symbol table.
    Called during setup and by the daily refresh scheduler.
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

    with db_session() as db:
        existing_tickers = {row[0] for row in db.query(Symbol.ticker).all()}

        for asset in tradable:
            t = asset.get("symbol", "")
            if not t:
                continue

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
            count += 1

        db.commit()

    logger.info("Seeded %d symbols", count)
    return {"count": count}
