"""AlpacaFeed: maintains a single WebSocket connection to Alpaca's market data
stream for stocks and crypto, subscribes to tickers as browser clients request
them, and broadcasts trade ticks through the ConnectionManager.

One connection is held per asset class:
  stocks -> wss://stream.data.alpaca.markets/v2/{feed}
  crypto -> wss://stream.data.alpaca.markets/v1beta3/crypto/us

When the number of subscribed stock tickers reaches alpaca_ws_symbol_limit,
the least recently active ticker is evicted to the overflow set. Overflow
tickers are not streamed; the REST quote endpoint serves their cached data.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import TYPE_CHECKING

import websockets
from websockets.exceptions import ConnectionClosed

from app.config import Config
from app.db.redis import get_redis

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

# seconds between drain loop iterations
DRAIN_INTERVAL = 1.0

# overflow tickers are polled via REST on this interval (seconds)
OVERFLOW_POLL_INTERVAL = 30.0

# reconnect backoff: 1s, 2s, 4s ... capped at 30s
BACKOFF_BASE = 1.0
BACKOFF_CAP = 30.0


class AlpacaFeed:
    def __init__(self, manager: ConnectionManager, config: Config) -> None:
        self._manager = manager
        self._config = config

        self._subscribed_stocks: set[str] = set()
        self._subscribed_crypto: set[str] = set()
        self._overflow: set[str] = set()

        self._ws_stocks: websockets.WebSocketClientProtocol | None = None
        self._ws_crypto: websockets.WebSocketClientProtocol | None = None

        self._running = False
        self._tasks: list[asyncio.Task] = []

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._tasks = [
            asyncio.create_task(self._run_stocks()),
            asyncio.create_task(self._run_crypto()),
            asyncio.create_task(self._drain_loop()),
        ]
        logger.info("AlpacaFeed started")

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("AlpacaFeed stopped")

    async def _auth_message(self) -> dict:
        return {
            "action": "auth",
            "key": self._config.alpaca_api_key,
            "secret": self._config.alpaca_secret_key,
        }

    async def _run_stocks(self) -> None:
        url = self._config.alpaca_ws_stocks_url
        backoff = BACKOFF_BASE
        while self._running:
            try:
                async with websockets.connect(url) as ws:
                    self._ws_stocks = ws
                    backoff = BACKOFF_BASE
                    await ws.send(json.dumps(await self._auth_message()))
                    logger.info("Alpaca stocks stream connected")

                    if self._subscribed_stocks:
                        await self._send_subscribe(ws, list(self._subscribed_stocks))

                    await self._recv_loop(ws, is_crypto=False)

            except ConnectionClosed as exc:
                logger.warning("Stocks stream disconnected: %s", exc)
            except Exception:
                logger.exception("Stocks stream error")
            finally:
                self._ws_stocks = None

            if not self._running:
                break
            logger.info("Stocks stream reconnecting in %.0fs", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_CAP)

    async def _run_crypto(self) -> None:
        url = self._config.alpaca_ws_crypto_url
        backoff = BACKOFF_BASE
        while self._running:
            try:
                async with websockets.connect(url) as ws:
                    self._ws_crypto = ws
                    backoff = BACKOFF_BASE
                    await ws.send(json.dumps(await self._auth_message()))
                    logger.info("Alpaca crypto stream connected")

                    if self._subscribed_crypto:
                        await self._send_subscribe(ws, list(self._subscribed_crypto))

                    await self._recv_loop(ws, is_crypto=True)

            except ConnectionClosed as exc:
                logger.warning("Crypto stream disconnected: %s", exc)
            except Exception:
                logger.exception("Crypto stream error")
            finally:
                self._ws_crypto = None

            if not self._running:
                break
            logger.info("Crypto stream reconnecting in %.0fs", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_CAP)

    async def _recv_loop(
        self, ws: websockets.WebSocketClientProtocol, is_crypto: bool
    ) -> None:
        async for raw in ws:
            if not self._running:
                break
            try:
                messages = json.loads(raw)
                if not isinstance(messages, list):
                    messages = [messages]
                for msg in messages:
                    await self._handle_message(msg)
            except Exception:
                logger.exception("Failed to handle message: %s", raw)

    async def _handle_message(self, msg: dict) -> None:
        msg_type = msg.get("T")

        if msg_type == "t":
            await self._handle_trade(msg)

        elif msg_type == "q":
            await self._handle_quote_tick(msg)

        elif msg_type == "error":
            logger.error("Alpaca stream error: %s", msg)

        elif msg_type in ("success", "subscription"):
            logger.debug("Alpaca stream: %s", msg)

    async def _handle_trade(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        price = msg.get("p")
        timestamp_str = msg.get("t", "")

        if not ticker or price is None:
            return

        now = int(time.time())

        redis = await get_redis()
        previous_close = await redis.hget(f"quote:{ticker}", "previous_close")

        change = None
        change_percent = None
        if previous_close:
            try:
                prev = float(previous_close)
                if prev > 0:
                    change = round(price - prev, 4)
                    change_percent = round((change / prev) * 100, 4)
            except ValueError:
                pass

        quote = {
            "price": price,
            "change": change,
            "change_percent": change_percent,
            "timestamp": now,
            "source": "alpaca_ws",
        }

        mapping = {k: str(v) for k, v in quote.items() if v is not None}
        await redis.hset(f"quote:{ticker}", mapping=mapping)
        await redis.sadd("quotes:dirty", ticker)

        await self._manager.broadcast(ticker, quote)

    async def _handle_quote_tick(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        bid = msg.get("bp")
        ask = msg.get("ap")

        if not ticker:
            return

        redis = await get_redis()
        mapping: dict[str, str] = {}
        if bid is not None:
            mapping["bid_price"] = str(bid)
        if ask is not None:
            mapping["ask_price"] = str(ask)
        if mapping:
            await redis.hset(f"quote:{ticker}", mapping=mapping)

    async def _drain_loop(self) -> None:
        while self._running:
            try:
                adds, removes = self._manager.drain_pending()

                for ticker in removes:
                    await self._unsubscribe_ticker(ticker)

                for ticker in adds:
                    await self._subscribe_ticker(ticker)

            except Exception:
                logger.exception("Drain loop error")

            await asyncio.sleep(DRAIN_INTERVAL)

    async def _subscribe_ticker(self, ticker: str) -> None:
        is_crypto = "/" in ticker

        if is_crypto:
            self._subscribed_crypto.add(ticker)
            if self._ws_crypto:
                await self._send_subscribe(self._ws_crypto, [ticker])
        else:
            limit = self._config.alpaca_ws_symbol_limit
            if len(self._subscribed_stocks) >= limit:
                evict = self._manager.least_active_ws_ticker(self._subscribed_stocks)
                if evict:
                    self._subscribed_stocks.discard(evict)
                    self._overflow.add(evict)
                    logger.info("Evicted %s to overflow (limit=%d)", evict, limit)
                    if self._ws_stocks:
                        await self._send_unsubscribe(self._ws_stocks, [evict])

            self._subscribed_stocks.add(ticker)
            self._overflow.discard(ticker)
            if self._ws_stocks:
                await self._send_subscribe(self._ws_stocks, [ticker])

    async def _unsubscribe_ticker(self, ticker: str) -> None:
        is_crypto = "/" in ticker

        if is_crypto:
            self._subscribed_crypto.discard(ticker)
            if self._ws_crypto:
                await self._send_unsubscribe(self._ws_crypto, [ticker])
        else:
            if ticker in self._subscribed_stocks:
                self._subscribed_stocks.discard(ticker)
                if self._ws_stocks:
                    await self._send_unsubscribe(self._ws_stocks, [ticker])

                # promote one overflow ticker into the freed slot
                if self._overflow:
                    promote = next(iter(self._overflow))
                    self._overflow.discard(promote)
                    self._subscribed_stocks.add(promote)
                    if self._ws_stocks:
                        await self._send_subscribe(self._ws_stocks, [promote])
                    logger.info("Promoted %s from overflow", promote)

            elif ticker in self._overflow:
                self._overflow.discard(ticker)

    async def _send_subscribe(
        self, ws: websockets.WebSocketClientProtocol, tickers: list[str]
    ) -> None:
        try:
            await ws.send(
                json.dumps(
                    {"action": "subscribe", "trades": tickers, "quotes": tickers}
                )
            )
        except Exception:
            logger.exception("Failed to send subscribe for %s", tickers)

    async def _send_unsubscribe(
        self, ws: websockets.WebSocketClientProtocol, tickers: list[str]
    ) -> None:
        try:
            await ws.send(
                json.dumps(
                    {"action": "unsubscribe", "trades": tickers, "quotes": tickers}
                )
            )
        except Exception:
            logger.exception("Failed to send unsubscribe for %s", tickers)
