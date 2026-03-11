"""Async Redis client for the quote hot-cache and pub/sub fan-out."""

import logging

import redis.asyncio as aioredis

from app.config import get_config

logger = logging.getLogger(__name__)

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return the shared async Redis connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        config = get_config()
        _pool = aioredis.from_url(
            config.redis_url,
            decode_responses=True,
        )
        logger.info("Redis connection pool created (%s)", config.redis_url)
    return _pool


async def close_redis() -> None:
    """Shutdown the Redis connection pool. Called on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Redis connection pool closed")
