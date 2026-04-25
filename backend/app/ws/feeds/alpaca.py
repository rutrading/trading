"""Alpaca market-data feed for quotes.

Maintains one stock stream and one crypto stream plus a drain loop that
reconciles subscriptions from ConnectionManager. Writes ticks to Redis and
broadcasts updates to browser clients.

If the WS fails MAX_FAILURES times in a row without ever authenticating,
the stream flips to REST polling for REST_WINDOW seconds before retrying WS.
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
from app.services.alpaca_rest import (
    AlpacaRequestFailed,
    AlpacaTickerNotFound,
    fetch_snapshot,
)
from app.ws.feeds.base import BaseFeed

if TYPE_CHECKING:
    from app.ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

DRAIN_INTERVAL = 1.0
BACKOFF_BASE = 1.0
BACKOFF_CAP = 30.0
LOG_COOLDOWN = 60.0
MAX_FAILURES = 5
REST_INTERVAL = 15.0
REST_WINDOW = 600.0
REST_CONCURRENCY = 5


class _StreamError(Exception):
    """Raised when Alpaca sends an error frame on the stream."""


class AlpacaFeed(BaseFeed):
    def __init__(self, manager: ConnectionManager, config: Config) -> None:
        super().__init__(manager)
        self._config = config

        self._subscribed_stocks: set[str] = set()
        self._subscribed_crypto: set[str] = set()
        self._overflow: set[str] = set()

        self._ws_stocks: ClientConnection | None = None
        self._ws_crypto: ClientConnection | None = None

        self._log_tracker: dict[str, float] = {}

    def _build_tasks(self) -> list[asyncio.Task]:
        return [
            asyncio.create_task(self._run_stream("stocks")),
            asyncio.create_task(self._run_stream("crypto")),
            asyncio.create_task(self._drain_loop()),
        ]

    async def stop(self) -> None:
        # Explicitly close the upstream Alpaca WS sockets before cancelling
        # the run loops. Free-tier accounts only allow one concurrent
        # connection, so during a redeploy the new container hits a 406
        # "connection limit exceeded" until the old container's socket
        # gets reaped. Closing here releases the slot in milliseconds
        # instead of waiting for TCP timeout.
        for attr in ("_ws_stocks", "_ws_crypto"):
            ws = getattr(self, attr, None)
            if ws is not None:
                try:
                    await ws.close()
                except Exception:
                    pass
                setattr(self, attr, None)
        await super().stop()

    # ---- stream state machine ---------------------------------------------

    async def _run_stream(self, stream_name: str) -> None:
        """Alternate between WS streaming and REST polling until stopped."""
        url, ws_attr, subscribed = self._stream_config(stream_name)

        while self._running:
            authenticated = await self._ws_session(stream_name, url, ws_attr, subscribed)
            if not self._running:
                return
            if authenticated:
                # Session worked at least once; keep trying WS.
                continue
            # Circuit breaker tripped — poll REST for a while, then retry WS.
            await self._poll_rest(stream_name, subscribed)

    def _stream_config(self, stream_name: str) -> tuple[str, str, set[str]]:
        if stream_name == "stocks":
            return (
                self._config.alpaca_ws_stocks_url,
                "_ws_stocks",
                self._subscribed_stocks,
            )
        return (
            self._config.alpaca_ws_crypto_url,
            "_ws_crypto",
            self._subscribed_crypto,
        )

    # ---- WS mode -----------------------------------------------------------

    async def _ws_session(
        self,
        stream_name: str,
        url: str,
        ws_attr: str,
        subscribed: MutableSet[str],
    ) -> bool:
        """Run the WS connect loop. Return True if we authenticated at least once."""
        backoff = BACKOFF_BASE
        failures = 0
        authenticated_once = False

        while self._running:
            try:
                async with connect(url) as ws:
                    setattr(self, ws_attr, ws)
                    await self._send_json(ws, {
                        "action": "auth",
                        "key": self._config.alpaca_api_key,
                        "secret": self._config.alpaca_secret_key,
                    })
                    ok = await self._recv(stream_name, ws, subscribed)
                    if ok:
                        authenticated_once = True
                        failures = 0
                        backoff = BACKOFF_BASE
            except (_StreamError, ConnectionClosed, Exception) as exc:
                failures += 1
                # 406 from Alpaca means another session (typically the
                # previous container during a redeploy) still holds the
                # single allowed WS slot. It's expected and self-resolves
                # once that socket closes — log at info, not warning, so
                # deploy logs stay quiet.
                if isinstance(exc, _StreamError) and "code=406" in str(exc):
                    logger.info(
                        "Alpaca %s stream waiting for previous session to release",
                        stream_name,
                    )
                else:
                    self._log_once(
                        f"ws-err:{stream_name}",
                        "Alpaca %s stream error: %s",
                        stream_name,
                        exc,
                    )
            finally:
                setattr(self, ws_attr, None)

            if not self._running:
                return authenticated_once
            if not authenticated_once and failures >= MAX_FAILURES:
                logger.info(
                    "Alpaca %s stream unavailable after %d attempts, switching to REST",
                    stream_name,
                    failures,
                )
                return False

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, BACKOFF_CAP)

        return authenticated_once

    async def _recv(
        self,
        stream_name: str,
        ws: ClientConnection,
        subscribed: MutableSet[str],
    ) -> bool:
        """Read frames until the ws closes. Returns True if we saw auth success."""
        authenticated = False

        async for raw in ws:
            if not self._running:
                break
            try:
                payload = json.loads(raw)
            except Exception:
                continue

            for msg in payload if isinstance(payload, list) else [payload]:
                msg_type = msg.get("T")

                if msg_type == "error":
                    raise _StreamError(
                        f"code={msg.get('code')} msg={msg.get('msg')}"
                    )

                if msg_type == "success" and msg.get("msg") == "authenticated":
                    if not authenticated:
                        authenticated = True
                        logger.info(
                            "Alpaca %s stream connected (%d tickers)",
                            stream_name,
                            len(subscribed),
                        )
                        if subscribed:
                            await self._send_action(ws, "subscribe", sorted(subscribed))
                    continue

                if msg_type == "t":
                    await self._handle_trade(msg)
                elif msg_type == "q":
                    await self._handle_quote_tick(msg)

        return authenticated

    # ---- REST fallback -----------------------------------------------------

    async def _poll_rest(self, stream_name: str, subscribed: MutableSet[str]) -> None:
        """Poll REST snapshots for subscribed tickers until REST_WINDOW elapses."""
        logger.info(
            "Alpaca %s REST polling: interval=%.0fs, retry WS in %.0fs",
            stream_name,
            REST_INTERVAL,
            REST_WINDOW,
        )

        semaphore = asyncio.Semaphore(REST_CONCURRENCY)

        async def poll_one(ticker: str) -> None:
            async with semaphore:
                try:
                    snapshot = await fetch_snapshot(ticker)
                except (AlpacaTickerNotFound, AlpacaRequestFailed):
                    return
                except Exception as exc:
                    self._log_once(
                        f"rest-err:{stream_name}",
                        "Alpaca REST poll error (%s): %s",
                        stream_name,
                        exc,
                    )
                    return

                await self._publish_quote(ticker, {
                    "price": snapshot.price,
                    "bid_price": snapshot.bid_price,
                    "ask_price": snapshot.ask_price,
                    "open": snapshot.open,
                    "high": snapshot.high,
                    "low": snapshot.low,
                    "previous_close": snapshot.previous_close,
                    "change": snapshot.change,
                    "change_percent": snapshot.change_percent,
                    "volume": snapshot.volume,
                    "timestamp": snapshot.timestamp,
                    "source": "alpaca_rest",
                })

        elapsed = 0.0
        while self._running and elapsed < REST_WINDOW:
            tickers = sorted(subscribed)
            if tickers:
                await asyncio.gather(
                    *(poll_one(t) for t in tickers), return_exceptions=True
                )
            await asyncio.sleep(REST_INTERVAL)
            elapsed += REST_INTERVAL

        if self._running:
            logger.info("Alpaca %s retrying WS after REST window", stream_name)

    # ---- tick handlers -----------------------------------------------------

    async def _handle_trade(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        price = msg.get("p")
        if not ticker or price is None:
            return

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

        await self._publish_quote(ticker, {
            "price": price,
            "change": change,
            "change_percent": change_percent,
            "timestamp": int(time.time()),
            "source": "alpaca_ws",
        })

    async def _handle_quote_tick(self, msg: dict) -> None:
        ticker = msg.get("S", "")
        if not ticker:
            return

        mapping: dict[str, str] = {}
        if (bid := msg.get("bp")) is not None:
            mapping["bid_price"] = str(bid)
        if (ask := msg.get("ap")) is not None:
            mapping["ask_price"] = str(ask)
        if mapping:
            await self._cache_fields(ticker, mapping)

    # ---- subscription reconciliation ---------------------------------------

    async def _drain_loop(self) -> None:
        while self._running:
            try:
                adds, removes = self._manager.drain_pending()
                for ticker in removes:
                    await self._unsubscribe_ticker(ticker)
                for ticker in adds:
                    await self._subscribe_ticker(ticker)
            except Exception as exc:
                self._log_once("drain", "Alpaca drain loop error: %s", exc)
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

    # ---- helpers -----------------------------------------------------------

    async def _send_action(
        self, ws: ClientConnection, action: str, tickers: list[str]
    ) -> None:
        if not tickers:
            return
        await self._send_json(ws, {
            "action": action,
            "trades": tickers,
            "quotes": tickers,
        })

    async def _send_json(self, ws: ClientConnection, payload: dict) -> None:
        try:
            await ws.send(json.dumps(payload))
        except Exception as exc:
            self._log_once("send-json", "Alpaca send failed: %s", exc)

    def _log_once(self, key: str, message: str, *args: object) -> None:
        """Log at most once per LOG_COOLDOWN seconds per key."""
        now = time.monotonic()
        if now - self._log_tracker.get(key, 0.0) < LOG_COOLDOWN:
            return
        self._log_tracker[key] = now
        logger.warning(message, *args)
