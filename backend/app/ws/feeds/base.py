from __future__ import annotations

import asyncio
import logging
from abc import ABC, abstractmethod

from app.db.redis import RedisClient, get_redis
from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)


class BaseFeed(ABC):
    def __init__(self, manager: ConnectionManager) -> None:
        self._manager = manager
        self._running = False
        self._tasks: list[asyncio.Task] = []

    @property
    def running(self) -> bool:
        return self._running

    async def start(self) -> None:
        if self._running:
            return

        self._running = True
        self._tasks = self._build_tasks()
        logger.info("%s started", self.__class__.__name__)

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("%s stopped", self.__class__.__name__)

    @abstractmethod
    def _build_tasks(self) -> list[asyncio.Task]:
        raise NotImplementedError

    async def _redis(self) -> RedisClient:
        return await get_redis()

    async def _cache_fields(self, ticker: str, fields: dict[str, str]) -> None:
        if not fields:
            return
        redis = await self._redis()
        await redis.hset(f"quote:{ticker}", mapping=fields)

    async def _publish_quote(self, ticker: str, quote: dict) -> None:
        fields = {k: str(v) for k, v in quote.items() if v is not None}
        await self._cache_fields(ticker, fields)

        redis = await self._redis()
        await redis.sadd("quotes:dirty", ticker)
        await self._manager.broadcast(ticker, quote)
