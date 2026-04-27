"""Quote cache + resolution chain.

Owns Redis hot-cache reads/writes, the Postgres warm-cache read, the
Alpaca REST fallback, and the `resolve_quote()` coordinator that walks
all three layers. Both the `/quote` REST endpoint and the order-placement
staleness check go through `resolve_quote()` so a quote is freshness-
checked the same way no matter who is asking."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

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

REDIS_QUOTE_PREFIX = "quote:"
QUOTE_FIELDS = tuple(QuoteData.model_fields.keys())


async def read_redis(ticker: str) -> QuoteData | None:
    """Read the current Redis hot-cache entry for `ticker`, or None on miss/error."""
    try:
        r = await get_redis()
        data = await r.hgetall(f"{REDIS_QUOTE_PREFIX}{ticker}")
        if not data:
            return None
        return QuoteData.from_redis_hash(ticker, data)
    except Exception as exc:
        logger.warning("Redis cache read failed for %s: %s", ticker, exc)
        return None


async def write_redis(quote: QuoteData) -> None:
    """Write a quote into the Redis hot-cache as a hash."""
    try:
        r = await get_redis()
        flat = quote.to_redis_mapping()
        if flat:
            await r.hset(f"{REDIS_QUOTE_PREFIX}{quote.ticker}", mapping=flat)
    except Exception as exc:
        logger.warning("Redis cache write failed for %s: %s", quote.ticker, exc)


def _read_from_postgres(ticker: str, db: Session | None = None) -> QuoteData | None:
    """Read warm-cache row. Uses the caller's session when provided so the
    FastAPI test override (and any active transaction) is honoured."""
    try:
        if db is not None:
            existing = db.query(Quote).filter(Quote.ticker == ticker).first()
            if not existing:
                return None
            return QuoteData.from_quote_row(existing)
        with db_session() as session:
            existing = session.query(Quote).filter(Quote.ticker == ticker).first()
            if not existing:
                return None
            return QuoteData.from_quote_row(existing)
    except Exception as exc:
        logger.warning("Postgres cache read failed for %s: %s", ticker, exc)
        return None


def persist_quote(quote_data: QuoteData, db: Session | None = None) -> None:
    """Upsert a quote into Postgres (warm cache layer).

    `db` lets the caller share a request-scoped session; when omitted,
    opens and commits its own short transaction. Both shapes write the
    full `QuoteData` field set so a partial Alpaca snapshot does not
    overwrite OHLCV columns the warm cache may have from a prior persist.
    """
    if db is not None:
        _persist_in(db, quote_data)
        db.commit()
        return
    with db_session() as session:
        _persist_in(session, quote_data)
        session.commit()


def _persist_in(db: Session, quote_data: QuoteData) -> None:
    payload = quote_data.to_db_payload()
    existing = db.query(Quote).filter(Quote.ticker == quote_data.ticker).first()
    if existing:
        for field in QUOTE_FIELDS:
            if field != "ticker":
                setattr(existing, field, payload.get(field))
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(Quote(**payload))


async def _fetch_from_alpaca(ticker: str) -> QuoteData:
    """Wrapper that maps Alpaca exceptions to HTTPException."""
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


async def resolve_quote(ticker: str, db: Session | None = None) -> QuoteResponse:
    """Walk Redis -> Postgres -> Alpaca and return the freshest known quote.

    A layer is treated as a hit only when its `price` is populated. The WS
    `_handle_quote_tick` writes only bid/ask to Redis (no `price`), so a
    quote-only state can land in Redis with a fresh timestamp but no last
    trade; without the `price`-presence gate we'd return that partial state
    and downstream callers (browser, order placement) would see `price=None`
    even when Postgres or Alpaca could fill it in. The next layer's write
    merges into Redis so bid/ask survive the fall-through.

    `db` is forwarded to the Postgres read so callers (the orders router)
    that already hold a request-scoped session honour the test override
    and any active transaction.
    """
    config = get_config()

    cached = await read_redis(ticker)
    if cached and cached.timestamp and cached.price is not None:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - cached.timestamp
        if cache_age < config.quote_staleness_seconds:
            return QuoteResponse(
                **cached.model_dump(),
                cached=True,
                cache_layer="redis",
                age_seconds=cache_age,
            )

    pg_data = _read_from_postgres(ticker, db=db)
    if pg_data and pg_data.timestamp and pg_data.price is not None:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - pg_data.timestamp
        if cache_age < config.quote_staleness_seconds:
            await write_redis(pg_data)
            return QuoteResponse(
                **pg_data.model_dump(),
                cached=True,
                cache_layer="postgres",
                age_seconds=cache_age,
            )

    quote_data = await _fetch_from_alpaca(ticker)
    await write_redis(quote_data)
    try:
        persist_quote(quote_data)
    except Exception as exc:
        logger.warning("Postgres persist skipped for %s: %s", ticker, exc)

    return QuoteResponse(
        **quote_data.model_dump(),
        cached=False,
        cache_layer="alpaca_rest",
        age_seconds=0,
    )
