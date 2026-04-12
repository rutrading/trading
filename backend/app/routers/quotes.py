"""Quote endpoint with Redis hot-cache, Postgres warm-cache, and Alpaca REST fallback."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.config import get_config
from app.db import Quote, db_session
from app.db.redis import get_redis
from app.schemas import QuoteData, QuoteResponse
from app.services.alpaca_rest import (
    AlpacaMissingCredentials,
    AlpacaRateLimited,
    AlpacaRequestFailed,
    AlpacaTickerNotFound,
    fetch_snapshot,
)

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
    """Wrapper around the shared snapshot fetcher that maps exceptions to HTTPException."""
    try:
        return await fetch_snapshot(ticker)
    except AlpacaMissingCredentials:
        raise HTTPException(status_code=502, detail="Missing Alpaca API credentials")
    except AlpacaTickerNotFound:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")
    except AlpacaRateLimited:
        raise HTTPException(status_code=429, detail="Alpaca rate limit exceeded")
    except AlpacaRequestFailed as exc:
        raise HTTPException(status_code=503, detail=str(exc))


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
