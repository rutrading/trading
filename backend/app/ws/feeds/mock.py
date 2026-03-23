"""MockFeed: local quote simulator used when Alpaca credentials are not set.

Generates synthetic quote ticks for currently subscribed tickers so the app can
run end-to-end in dev without external market-data credentials.
"""

from __future__ import annotations

import asyncio
import random
import time

from app.ws.feeds.base import BaseFeed
from app.ws.manager import ConnectionManager


class MockFeed(BaseFeed):
    """Local quote simulator used when Alpaca credentials are unavailable."""

    def __init__(self, manager: ConnectionManager) -> None:
        super().__init__(manager)
        self._prices: dict[str, float] = {}
        self._opens: dict[str, float] = {}

    def _build_tasks(self) -> list[asyncio.Task]:
        """Run a single periodic loop task."""
        return [asyncio.create_task(self._loop())]

    def _initial_price(self, ticker: str) -> float:
        """Pick a random starting price for a ticker."""
        if "/" in ticker:
            return round(random.uniform(500, 50000), 2)
        return round(random.uniform(20, 500), 2)

    async def _loop(self) -> None:
        """Generate and publish synthetic quote ticks once per second."""
        while self._running:
            adds, _ = self._manager.drain_pending()

            for ticker in adds:
                ticker = ticker.upper()
                if ticker not in self._prices:
                    p = self._initial_price(ticker)
                    self._prices[ticker] = p
                    self._opens[ticker] = p

            tickers = sorted(self._manager.active_tickers)
            now = int(time.time())

            for ticker in tickers:
                current = self._prices.get(ticker)
                if current is None:
                    current = self._initial_price(ticker)
                    self._prices[ticker] = current
                    self._opens[ticker] = current

                # small random walk each second
                drift = random.uniform(-0.003, 0.003)
                next_price = max(0.01, round(current * (1 + drift), 2))
                self._prices[ticker] = next_price

                open_price = self._opens.get(ticker, next_price)
                change = round(next_price - open_price, 2)
                change_percent = (
                    round((change / open_price) * 100, 4) if open_price else 0.0
                )

                bid = round(next_price - 0.01, 2)
                ask = round(next_price + 0.01, 2)

                quote = {
                    "price": next_price,
                    "change": change,
                    "change_percent": change_percent,
                    "bid_price": bid,
                    "ask_price": ask,
                    "timestamp": now,
                    "source": "mock",
                }
                await self._publish_quote(ticker, quote)

            await asyncio.sleep(1)
