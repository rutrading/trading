"""Quote endpoint with Redis hot-cache, Postgres warm-cache, and Alpaca REST fallback."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.config import get_config
from app.db import Quote, db_session
from app.db.redis import get_redis

logger = logging.getLogger(__name__)
router = APIRouter()

QUOTE_FIELDS = (
    "ticker",
    "price",
    "bid_price",
    "bid_size",
    "ask_price",
    "ask_size",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "trade_count",
    "vwap",
    "previous_close",
    "change",
    "change_percent",
    "source",
    "timestamp",
)

REDIS_QUOTE_PREFIX = "quote:"


def _is_fresh(updated_at: datetime | None, staleness_seconds: int) -> bool:
    """Check whether a cached quote is still within the staleness window."""
    if not updated_at:
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - updated_at < timedelta(
        seconds=staleness_seconds
    )


def _redis_hash_to_quote(data: dict) -> dict:
    """Convert a Redis hash (all string values) into typed quote dict."""
    if not data:
        return {}

    def to_float(key: str) -> float | None:
        val = data.get(key)
        if val is None or val == "":
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    def to_int(key: str) -> int | None:
        val = data.get(key)
        if val is None or val == "":
            return None
        try:
            return int(float(val))
        except (TypeError, ValueError):
            return None

    return {
        "ticker": data.get("ticker", ""),
        "price": to_float("price"),
        "bid_price": to_float("bid_price"),
        "bid_size": to_float("bid_size"),
        "ask_price": to_float("ask_price"),
        "ask_size": to_float("ask_size"),
        "open": to_float("open"),
        "high": to_float("high"),
        "low": to_float("low"),
        "close": to_float("close"),
        "volume": to_float("volume"),
        "trade_count": to_int("trade_count"),
        "vwap": to_float("vwap"),
        "previous_close": to_float("previous_close"),
        "change": to_float("change"),
        "change_percent": to_float("change_percent"),
        "source": data.get("source", ""),
        "timestamp": to_int("timestamp"),
    }


def _persist_quote(ticker: str, quote_data: dict) -> None:
    """Upsert a quote into Postgres (warm cache layer)."""
    with db_session() as db:
        existing = db.query(Quote).filter(Quote.ticker == ticker).first()
        if existing:
            for field in QUOTE_FIELDS:
                if field != "ticker":
                    setattr(existing, field, quote_data.get(field))
            existing.updated_at = datetime.now(timezone.utc)
        else:
            payload = {field: quote_data.get(field) for field in QUOTE_FIELDS}
            db.add(Quote(**payload))
        db.commit()


async def _cache_to_redis(ticker: str, quote_data: dict) -> None:
    """Write a quote into the Redis hot-cache as a hash."""
    try:
        r = await get_redis()
        key = f"{REDIS_QUOTE_PREFIX}{ticker}"
        # flatten all values to strings for Redis hash storage
        flat = {}
        for k, v in quote_data.items():
            if v is not None:
                flat[k] = str(v)
        if flat:
            await r.hset(key, mapping=flat)
    except Exception as exc:
        logger.warning("Redis cache write failed for %s: %s", ticker, exc)


async def _read_from_redis(ticker: str) -> dict | None:
    """Try to read a quote from the Redis hot-cache."""
    try:
        r = await get_redis()
        data = await r.hgetall(f"{REDIS_QUOTE_PREFIX}{ticker}")
        if not data:
            return None
        return _redis_hash_to_quote(data)
    except Exception as exc:
        logger.warning("Redis cache read failed for %s: %s", ticker, exc)
        return None


def _read_from_postgres(ticker: str) -> dict | None:
    """Try to read a quote from the Postgres warm-cache."""
    try:
        with db_session() as db:
            existing = db.query(Quote).filter(Quote.ticker == ticker).first()
            if not existing:
                return None
            return {field: getattr(existing, field, None) for field in QUOTE_FIELDS}
    except Exception as exc:
        logger.warning("Postgres cache read failed for %s: %s", ticker, exc)
        return None


async def _fetch_from_alpaca(ticker: str) -> dict:
    """Fetch a snapshot from Alpaca REST and return a normalized quote dict."""
    config = get_config()

    # no keys configured
    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise HTTPException(status_code=502, detail="Missing Alpaca API credentials")

    headers = {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }

    # crypto tickers contain a slash (e.g. "BTC/USD")
    is_crypto = "/" in ticker

    try:
        async with httpx.AsyncClient(
            base_url=config.alpaca_data_base_url, timeout=10.0
        ) as client:
            if is_crypto:
                # crypto snapshot endpoint uses query param
                res = await client.get(
                    "/v1beta3/crypto/us/snapshots",
                    params={"symbols": ticker},
                    headers=headers,
                )
            else:
                # stock snapshot endpoint uses path param
                res = await client.get(
                    f"/v2/stocks/{ticker}/snapshot",
                    params={"feed": config.alpaca_feed},
                    headers=headers,
                )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            raise HTTPException(status_code=502, detail="Alpaca authentication failed")
        if status == 404:
            raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")
        if status == 422:
            raise HTTPException(status_code=400, detail="Invalid snapshot request")
        if status == 429:
            raise HTTPException(status_code=429, detail="Alpaca rate limit exceeded")
        raise HTTPException(status_code=503, detail=f"Alpaca request failed ({status})")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca request failed: {exc}")

    body = res.json()

    if is_crypto:
        # crypto response: {"snapshots": {"BTC/USD": {...}}}
        snap = body.get("snapshots", {}).get(ticker, {})
    else:
        # stock response is the snapshot object directly
        snap = body

    latest_trade = snap.get("latestTrade", {})
    latest_quote = snap.get("latestQuote", {})
    daily_bar = snap.get("dailyBar", {})
    prev_daily_bar = snap.get("prevDailyBar", {})

    price = float(latest_trade.get("p", 0))
    prev_close = float(prev_daily_bar.get("c", 0))
    change = price - prev_close if prev_close else 0
    change_pct = (change / prev_close * 100) if prev_close else 0

    now_ts = int(datetime.now(timezone.utc).timestamp())

    return {
        "ticker": ticker,
        "price": price,
        "bid_price": float(latest_quote.get("bp", 0)),
        "bid_size": float(latest_quote.get("bs", 0)),
        "ask_price": float(latest_quote.get("ap", 0)),
        "ask_size": float(latest_quote.get("as", 0)),
        "open": float(daily_bar.get("o", 0)),
        "high": float(daily_bar.get("h", 0)),
        "low": float(daily_bar.get("l", 0)),
        "close": float(daily_bar.get("c", 0)),
        "volume": float(daily_bar.get("v", 0)),
        "trade_count": int(daily_bar.get("n", 0)),
        "vwap": float(daily_bar.get("vw", 0)),
        "previous_close": prev_close,
        "change": round(change, 4),
        "change_percent": round(change_pct, 4),
        "source": "alpaca_rest",
        "timestamp": now_ts,
    }


@router.get("/quote")
async def get_quote(
    ticker: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
):
    """Get a quote for a ticker. Reads Redis -> Postgres -> Alpaca REST (in that order)."""
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    config = get_config()

    # 1) try Redis hot-cache
    cached = await _read_from_redis(ticker)
    if cached and cached.get("timestamp"):
        cache_age = int(datetime.now(timezone.utc).timestamp()) - (
            cached.get("timestamp") or 0
        )
        # return if within staleness window
        if cache_age < config.quote_staleness_seconds:
            cached["cached"] = True
            cached["cache_layer"] = "redis"
            cached["age_seconds"] = cache_age
            return cached

    # 2) try Postgres warm-cache
    pg_data = _read_from_postgres(ticker)
    if pg_data and pg_data.get("timestamp"):
        cache_age = int(datetime.now(timezone.utc).timestamp()) - (
            pg_data.get("timestamp") or 0
        )
        if cache_age < config.quote_staleness_seconds:
            # backfill into Redis for next request
            await _cache_to_redis(ticker, pg_data)
            pg_data["cached"] = True
            pg_data["cache_layer"] = "postgres"
            pg_data["age_seconds"] = cache_age
            return pg_data

    # 3) fetch live from Alpaca REST
    quote_data = await _fetch_from_alpaca(ticker)

    # cache to Redis (hot) and Postgres (warm), best-effort
    await _cache_to_redis(ticker, quote_data)
    try:
        _persist_quote(ticker, quote_data)
    except Exception as exc:
        logger.warning("Postgres persist skipped for %s: %s", ticker, exc)

    quote_data["cached"] = False
    quote_data["cache_layer"] = "alpaca_rest"
    quote_data["age_seconds"] = 0
    return quote_data
