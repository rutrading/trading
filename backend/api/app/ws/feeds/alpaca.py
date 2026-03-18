"""Alpaca market-data feed for quotes.

Maintains one stock stream and one crypto stream, reconciles subscriptions from
ConnectionManager, writes latest ticks to Redis, and broadcasts updates to
browser clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import MutableSet
from typing import TYPE_CHECKING

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed

from app.config import Config
from app.ws.feeds.base import BaseFeed

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

DRAIN_INTERVAL = 1.0
BACKOFF_BASE = 1.0
BACKOFF_CAP = 30.0
ERROR_LOG_COOLDOWN = 30.0


class AlpacaFeed(BaseFeed):
    def __init__(self, manager: ConnectionManager, config: Config) -> None:
        super().__init__(manager)
        self._config = config

        self._subscribed_stocks: set[str] = set()
        self._subscribed_crypto: set[str] = set()
        self._overflow: set[str] = set()

        self._ws_stocks: ClientConnection | None = None
        self._ws_crypto: ClientConnection | None = None

        self._last_error_log: dict[str, float] = {}

    def _build_tasks(self) -> list[asyncio.Task]:
        return [
            asyncio.create_task(
                self._run_stream(
                    stream_name="stocks",
                    url=self._config.alpaca_ws_stocks_url,
                    ws_attr="_ws_stocks",
                    subscribed=self._subscribed_stocks,
                )
            ),
            asyncio.create_task(
                self._run_stream(
                    stream_name="crypto",
                    url=self._config.alpaca_ws_crypto_url,
                    ws_attr="_ws_crypto",
                    subscribed=self._subscribed_crypto,
                )
            ),
            asyncio.create_task(self._drain_loop()),
        ]

    def _auth_payload(self) -> dict[str, str]:
        return {
            "action": "auth",
            "key": self._config.alpaca_api_key,
            "secret": self._config.alpaca_secret_key,
        }

    async def _run_stream(
        self,
        stream_name: str,
        url: str,
        ws_attr: str,
        subscribed: MutableSet[str],
    ) -> None:
        backoff = BACKOFF_BASE

        while self._running:
            try:
                async with connect(url) as ws:
                    setattr(self, ws_attr, ws)
                    backoff = BACKOFF_BASE

                    await self._send_json(ws, self._auth_payload())
                    logger.info("Alpaca %s stream connected", stream_name)

                    if subscribed:
                        await self._send_action(ws, "subscribe", sorted(subscribed))

                    await self._recv_loop(stream_name, ws)

            except ConnectionClosed as exc:
                self._log_rate_limited(
                    f"disconnect:{stream_name}",
                    logging.WARNING,
                    "Alpaca %s stream disconnected: %s",
                    stream_name,
                    exc,
                )
            except Exception as exc:
                self._log_rate_limited(
                    f"error:{stream_name}",
                    logging.ERROR,
                    "Alpaca %s stream error: %s",
                    stream_name,
                    exc,
                )
            finally:
                setattr(self, ws_attr, None)

            if not self._running:
                break

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_CAP)

    async def _recv_loop(self, stream_name: str, ws: ClientConnection) -> None:
        async for raw in ws:
            if not self._running:
                break

            try:
                payload = json.loads(raw)
            except Exception:
                self._log_rate_limited(
                    f"json:{stream_name}",
                    logging.ERROR,
                    "Invalid JSON from Alpaca %s stream",
                    stream_name,
                )
                continue

            messages = payload if isinstance(payload, list) else [payload]
            for msg in messages:
                await self._handle_message(stream_name, msg)

    async def _handle_message(self, stream_name: str, msg: dict) -> None:
        msg_type = msg.get("T")

        if msg_type == "t":
            await self._handle_trade(msg)
            return

        if msg_type == "q":
            await self._handle_quote_tick(msg)
            return

        if msg_type == "error":
            code = msg.get("code", "unknown")
            self._log_rate_limited(
                f"alpaca:{stream_name}:{code}",
                logging.ERROR,
                "Alpaca %s stream error: %s",
                stream_name,
                msg,
            )
            return

        if msg_type in ("success", "subscription"):
            logger.debug("Alpaca %s stream: %s", stream_name, msg)

    async def _handle_trade(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        price = msg.get("p")
        if not ticker or price is None:
            return

        now = int(time.time())
        redis = await self._redis()

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

        await self._publish_quote(ticker, quote)

    async def _handle_quote_tick(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        if not ticker:
            return

        bid = msg.get("bp")
        ask = msg.get("ap")
        mapping: dict[str, str] = {}
        if bid is not None:
            mapping["bid_price"] = str(bid)
        if ask is not None:
            mapping["ask_price"] = str(ask)
        if not mapping:
            return

        await self._cache_fields(ticker, mapping)

    async def _drain_loop(self) -> None:
        while self._running:
            try:
                adds, removes = self._manager.drain_pending()

                for ticker in removes:
                    await self._unsubscribe_ticker(ticker)

                for ticker in adds:
                    await self._subscribe_ticker(ticker)

            except Exception as exc:
                self._log_rate_limited(
                    "drain-loop",
                    logging.ERROR,
                    "Alpaca drain loop error: %s",
                    exc,
                )

            await asyncio.sleep(DRAIN_INTERVAL)

    async def _subscribe_ticker(self, ticker: str) -> None:
        ticker = ticker.upper()

        if "/" in ticker:
            if ticker in self._subscribed_crypto:
                return
            self._subscribed_crypto.add(ticker)
            if self._ws_crypto:
                await self._send_action(self._ws_crypto, "subscribe", [ticker])
            return

        if ticker in self._subscribed_stocks:
            return

        limit = self._config.alpaca_ws_symbol_limit
        if len(self._subscribed_stocks) >= limit:
            evict = self._manager.least_active_ws_ticker(self._subscribed_stocks)
            if evict:
                self._subscribed_stocks.discard(evict)
                self._overflow.add(evict)
                if self._ws_stocks:
                    await self._send_action(self._ws_stocks, "unsubscribe", [evict])
                logger.info("Evicted %s to overflow (limit=%d)", evict, limit)

        self._subscribed_stocks.add(ticker)
        self._overflow.discard(ticker)
        if self._ws_stocks:
            await self._send_action(self._ws_stocks, "subscribe", [ticker])

    async def _unsubscribe_ticker(self, ticker: str) -> None:
        ticker = ticker.upper()

        if "/" in ticker:
            if ticker in self._subscribed_crypto:
                self._subscribed_crypto.discard(ticker)
                if self._ws_crypto:
                    await self._send_action(self._ws_crypto, "unsubscribe", [ticker])
            return

        if ticker in self._overflow:
            self._overflow.discard(ticker)
            return

        if ticker not in self._subscribed_stocks:
            return

        self._subscribed_stocks.discard(ticker)
        if self._ws_stocks:
            await self._send_action(self._ws_stocks, "unsubscribe", [ticker])

        if self._overflow:
            promote = next(iter(self._overflow))
            self._overflow.discard(promote)
            self._subscribed_stocks.add(promote)
            if self._ws_stocks:
                await self._send_action(self._ws_stocks, "subscribe", [promote])
            logger.info("Promoted %s from overflow", promote)

    async def _send_action(
        self, ws: ClientConnection, action: str, tickers: list[str]
    ) -> None:
        if not tickers:
            return

        await self._send_json(
            ws,
            {
                "action": action,
                "trades": tickers,
                "quotes": tickers,
            },
        )

    async def _send_json(self, ws: ClientConnection, payload: dict) -> None:
        try:
            await ws.send(json.dumps(payload))
        except Exception as exc:
            self._log_rate_limited(
                "send-json",
                logging.ERROR,
                "Failed to send stream payload: %s",
                exc,
            )

    def _log_rate_limited(
        self, key: str, level: int, message: str, *args: object
    ) -> None:
        now = time.monotonic()
        last = self._last_error_log.get(key, 0.0)
        if now - last < ERROR_LOG_COOLDOWN:
            return
        self._last_error_log[key] = now
        logger.log(level, message, *args)
