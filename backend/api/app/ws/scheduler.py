"""TickerScheduler: generates mock price ticks for subscribed tickers,
writes to Redis, and broadcasts via ConnectionManager.

In production this will be swapped for a real Alpaca WebSocket feed.
The mock mode generates random-walk prices for testing without
needing API credentials or market hours."""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import TYPE_CHECKING

from app.db.redis import get_redis

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

# well-known tickers with realistic starting prices for mock mode
MOCK_PRICES: dict[str, float] = {
    "AAPL": 185.0,
    "GOOGL": 141.0,
    "MSFT": 415.0,
    "AMZN": 185.0,
    "TSLA": 245.0,
    "NVDA": 880.0,
    "META": 500.0,
    "SPY": 510.0,
    "QQQ": 440.0,
    "AMD": 160.0,
    "NFLX": 620.0,
    "JPM": 195.0,
    "V": 280.0,
    "DIS": 112.0,
}

# fallback price for unknown tickers
DEFAULT_PRICE = 100.0

# how often mock ticks fire (seconds)
TICK_INTERVAL = 1.0

# max percent change per tick
MAX_JITTER = 0.003


class TickerScheduler:
    def __init__(self, manager: ConnectionManager) -> None:
        self._manager = manager
        # ticker -> current simulated price
        self._prices: dict[str, float] = {}
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("TickerScheduler started (mock mode)")

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("TickerScheduler stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                # pick up new tickers or drop removed ones
                adds, removes = self._manager.drain_pending()
                for ticker in adds:
                    if ticker not in self._prices:
                        self._prices[ticker] = MOCK_PRICES.get(ticker, DEFAULT_PRICE)
                        logger.debug(
                            "Mock tracking %s @ %.2f", ticker, self._prices[ticker]
                        )
                for ticker in removes:
                    self._prices.pop(ticker, None)

                # generate ticks for all active tickers
                active = self._manager.active_tickers
                if active:
                    await self._tick(active)

                await asyncio.sleep(TICK_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("TickerScheduler loop error")
                await asyncio.sleep(TICK_INTERVAL)

    async def _tick(self, tickers: set[str]) -> None:
        redis = await get_redis()
        now = int(time.time())

        for ticker in tickers:
            if ticker not in self._prices:
                self._prices[ticker] = MOCK_PRICES.get(ticker, DEFAULT_PRICE)

            price = self._prices[ticker]
            # random walk: jitter between -MAX_JITTER and +MAX_JITTER
            change_pct = random.uniform(-MAX_JITTER, MAX_JITTER)
            new_price = round(price * (1 + change_pct), 2)
            self._prices[ticker] = new_price

            change = round(new_price - price, 2)
            base_price = MOCK_PRICES.get(ticker, DEFAULT_PRICE)
            total_change = round(new_price - base_price, 2)
            total_change_pct = round((total_change / base_price) * 100, 4)

            quote = {
                "price": new_price,
                "change": total_change,
                "change_percent": total_change_pct,
                "bid_price": round(new_price - 0.01, 2),
                "ask_price": round(new_price + 0.01, 2),
                "timestamp": now,
                "source": "mock",
            }

            # write to Redis hash — flush task picks these up periodically
            redis_key = f"quote:{ticker}"
            await redis.hset(redis_key, mapping={k: str(v) for k, v in quote.items()})
            await redis.sadd("quotes:dirty", ticker)

            # broadcast to subscribed clients
            await self._manager.broadcast(ticker, quote)
