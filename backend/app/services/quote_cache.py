"""Shared helpers for the Redis quote hot-cache.

Both `routers/quotes.py` (REST endpoint) and `ws/router.py` (snapshot
on subscribe) need to read the same Redis hash with the same shape.
Keep that read in one place so the two paths can't drift."""

from __future__ import annotations

import logging

from app.db.redis import get_redis
from app.schemas import QuoteData

logger = logging.getLogger(__name__)

REDIS_QUOTE_PREFIX = "quote:"


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
