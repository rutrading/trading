"""Async Redis client for the quote hot-cache and pub/sub fan-out."""

import logging
from typing import Protocol, cast

from redis.asyncio import from_url

from app.config import get_config

logger = logging.getLogger(__name__)


class RedisClient(Protocol):
    async def get(self, name: str) -> str | None: ...

    async def set(
        self, name: str, value: str, ex: int | None = None
    ) -> bool | None: ...

    async def hget(self, name: str, key: str) -> str | None: ...

    async def hgetall(self, name: str) -> dict[str, str]: ...

    async def hset(
        self,
        name: str,
        key: str | None = None,
        value: str | None = None,
        mapping: dict[str, str] | None = None,
        items: list[tuple[str, str]] | None = None,
    ) -> int: ...

    async def sadd(self, name: str, *values: str) -> int: ...

    async def spop(self, name: str) -> str | None: ...

    async def zincrby(self, name: str, amount: float, value: str) -> float: ...

    async def zrevrange(self, name: str, start: int, end: int) -> list[str]: ...

    async def close(self) -> None: ...


_pool: RedisClient | None = None


async def get_redis() -> RedisClient:
    """Return the shared async Redis connection pool, creating it on first call."""
    global _pool
    if _pool is None:
        config = get_config()
        raw_client = from_url(config.redis_url, decode_responses=True)
        _pool = cast(RedisClient, raw_client)
        logger.info("Redis connection pool created (%s)", config.redis_url)
    return _pool


async def close_redis() -> None:
    """Shutdown the Redis connection pool. Called on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Redis connection pool closed")
