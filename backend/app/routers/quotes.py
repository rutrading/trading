"""Quote endpoint with Redis hot-cache, Postgres warm-cache, and Alpaca REST fallback."""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.config import get_config
from app.db import Quote, db_session
from app.db.redis import get_redis
from app.schemas import QuoteData, QuoteResponse

logger = logging.getLogger(__name__)
router = APIRouter()

QUOTE_FIELDS = tuple(QuoteData.model_fields.keys())

REDIS_QUOTE_PREFIX = "quote:"


def _persist_quote(quote_data: QuoteData) -> None:
    """Upsert a quote into Postgres (warm cache layer)."""
    payload = quote_data.to_db_payload()
    with db_session() as db:
        existing = db.query(Quote).filter(Quote.ticker == quote_data.ticker).first()
        if existing:
            for field in QUOTE_FIELDS:
                if field != "ticker":
                    setattr(existing, field, payload.get(field))
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(Quote(**payload))
        db.commit()


async def _cache_to_redis(quote_data: QuoteData) -> None:
    """Write a quote into the Redis hot-cache as a hash."""
    try:
        r = await get_redis()
        key = f"{REDIS_QUOTE_PREFIX}{quote_data.ticker}"
        flat = quote_data.to_redis_mapping()
        if flat:
            await r.hset(key, mapping=flat)
    except Exception as exc:
        logger.warning("Redis cache write failed for %s: %s", quote_data.ticker, exc)


async def _read_from_redis(ticker: str) -> QuoteData | None:
    """Try to read a quote from the Redis hot-cache."""
    try:
        r = await get_redis()
        data = await r.hgetall(f"{REDIS_QUOTE_PREFIX}{ticker}")
        if not data:
            return None
        return QuoteData.from_redis_hash(ticker, data)
    except Exception as exc:
        logger.warning("Redis cache read failed for %s: %s", ticker, exc)
        return None


def _read_from_postgres(ticker: str) -> QuoteData | None:
    """Try to read a quote from the Postgres warm-cache."""
    try:
        with db_session() as db:
            existing = db.query(Quote).filter(Quote.ticker == ticker).first()
            if not existing:
                return None
            return QuoteData.from_quote_row(existing)
    except Exception as exc:
        logger.warning("Postgres cache read failed for %s: %s", ticker, exc)
        return None


async def _fetch_from_alpaca(ticker: str) -> QuoteData:
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

    return QuoteData(
        ticker=ticker,
        price=price,
        bid_price=float(latest_quote.get("bp", 0)),
        bid_size=float(latest_quote.get("bs", 0)),
        ask_price=float(latest_quote.get("ap", 0)),
        ask_size=float(latest_quote.get("as", 0)),
        open=float(daily_bar.get("o", 0)),
        high=float(daily_bar.get("h", 0)),
        low=float(daily_bar.get("l", 0)),
        close=float(daily_bar.get("c", 0)),
        volume=float(daily_bar.get("v", 0)),
        trade_count=int(daily_bar.get("n", 0)),
        vwap=float(daily_bar.get("vw", 0)),
        previous_close=prev_close,
        change=round(change, 4),
        change_percent=round(change_pct, 4),
        source="alpaca_rest",
        timestamp=now_ts,
    )


@router.get("/quote", response_model=QuoteResponse)
async def get_quote(
    ticker: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> QuoteResponse:
    """Get a quote for a ticker. Reads Redis -> Postgres -> Alpaca REST (in that order)."""
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    config = get_config()

    # 1) try Redis hot-cache
    cached = await _read_from_redis(ticker)
    if cached and cached.timestamp:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - cached.timestamp
        # return if within staleness window
        if cache_age < config.quote_staleness_seconds:
            return QuoteResponse(
                **cached.model_dump(),
                cached=True,
                cache_layer="redis",
                age_seconds=cache_age,
            )

    # 2) try Postgres warm-cache
    pg_data = _read_from_postgres(ticker)
    if pg_data and pg_data.timestamp:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - pg_data.timestamp
        if cache_age < config.quote_staleness_seconds:
            # backfill into Redis for next request
            await _cache_to_redis(pg_data)
            return QuoteResponse(
                **pg_data.model_dump(),
                cached=True,
                cache_layer="postgres",
                age_seconds=cache_age,
            )

    # 3) fetch live from Alpaca REST
    quote_data = await _fetch_from_alpaca(ticker)

    # cache to Redis (hot) and Postgres (warm), best-effort
    await _cache_to_redis(quote_data)
    try:
        _persist_quote(quote_data)
    except Exception as exc:
        logger.warning("Postgres persist skipped for %s: %s", ticker, exc)

    return QuoteResponse(
        **quote_data.model_dump(),
        cached=False,
        cache_layer="alpaca_rest",
        age_seconds=0,
    )
