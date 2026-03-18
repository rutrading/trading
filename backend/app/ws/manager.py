"""ConnectionManager: tracks browser WebSocket connections, per-user
subscriptions, and ref-counted ticker tracking.

Grace period: when a user's last connection drops, their ticker
subscriptions are held for GRACE_SECONDS. If the same user reconnects
within that window their subs are restored automatically. Otherwise
the tickers are cleaned up."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# how long to hold a disconnected user's subscriptions
GRACE_SECONDS = 30


class ConnectionManager:
    def __init__(self) -> None:
        # ws -> set of tickers that ws is subscribed to
        self._subs: dict[WebSocket, set[str]] = {}
        # ticker -> set of ws clients subscribed
        self._ticker_clients: dict[str, set[WebSocket]] = defaultdict(set)
        # ws -> user_id for per-user tracking
        self._ws_user: dict[WebSocket, str] = {}
        # user_id -> set of ws connections (a user can have multiple tabs)
        self._user_connections: dict[str, set[WebSocket]] = defaultdict(set)
        # user_id -> saved tickers from grace period (waiting for reconnect)
        self._grace_tickers: dict[str, set[str]] = {}
        # user_id -> asyncio.Task running the grace timer
        self._grace_tasks: dict[str, asyncio.Task] = {}
        self._lock = asyncio.Lock()

        # ticker -> monotonic timestamp of last subscribe or received broadcast
        self._ticker_last_active: dict[str, float] = {}

        # pending ticker changes the feed drains each loop
        self._pending_adds: set[str] = set()
        self._pending_removes: set[str] = set()

    def _mark_tracked(self, tickers: list[str]) -> None:
        for ticker in tickers:
            self._pending_removes.discard(ticker)
            self._pending_adds.add(ticker)

    def _mark_untracked(self, tickers: list[str]) -> None:
        for ticker in tickers:
            self._pending_adds.discard(ticker)
            self._pending_removes.add(ticker)

    async def connect(self, ws: WebSocket, user_id: str) -> None:
        await ws.accept()
        restored: set[str] = set()

        async with self._lock:
            self._subs[ws] = set()
            self._ws_user[ws] = user_id
            self._user_connections[user_id].add(ws)

            # user reconnected within grace period — restore their subs
            if user_id in self._grace_tasks:
                self._grace_tasks[user_id].cancel()
                del self._grace_tasks[user_id]
                saved = self._grace_tickers.pop(user_id, set())
                if saved:
                    restored = saved
                    self._subs[ws] = set(saved)
                    for ticker in saved:
                        self._ticker_clients[ticker].add(ws)
                    logger.info(
                        "Restored %d tickers for user=%s: %s",
                        len(saved),
                        user_id,
                        saved,
                    )

        if restored:
            # tell the client which tickers were restored
            await ws.send_text(
                json.dumps(
                    {
                        "type": "restored",
                        "tickers": sorted(restored),
                    }
                )
            )

        logger.info(
            "Client connected: user=%s (%d total connections)",
            user_id,
            len(self._subs),
        )

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            tickers = self._subs.pop(ws, set())
            user_id = self._ws_user.pop(ws, None)

            if user_id:
                self._user_connections[user_id].discard(ws)

            # remove ws from per-ticker client sets
            for ticker in tickers:
                self._ticker_clients[ticker].discard(ws)

            # check if user still has other active connections
            user_still_connected = (
                user_id is not None
                and len(self._user_connections.get(user_id, set())) > 0
            )

            if user_id and not user_still_connected:
                # user's last connection dropped — start grace period
                # keep tickers tracked in the scheduler during grace
                self._grace_tickers[user_id] = set(tickers)
                task = asyncio.create_task(self._grace_expire(user_id, set(tickers)))
                self._grace_tasks[user_id] = task
                logger.info(
                    "Grace period started for user=%s (%ds), holding %d tickers",
                    user_id,
                    GRACE_SECONDS,
                    len(tickers),
                )
            else:
                # user has other tabs open, or unknown user — clean up normally
                removed: list[str] = []
                for ticker in tickers:
                    if not self._ticker_clients[ticker]:
                        del self._ticker_clients[ticker]
                        removed.append(ticker)
                if removed:
                    self._mark_untracked(removed)

            # clean up empty user entries
            if user_id and not self._user_connections.get(user_id):
                self._user_connections.pop(user_id, None)

        logger.info(
            "Client disconnected: user=%s (%d remaining)",
            user_id or "unknown",
            len(self._subs),
        )

    async def _grace_expire(self, user_id: str, tickers: set[str]) -> None:
        """Wait for the grace period, then untrack tickers if the user
        never reconnected."""
        try:
            await asyncio.sleep(GRACE_SECONDS)
        except asyncio.CancelledError:
            # user reconnected — grace was cancelled
            return

        async with self._lock:
            # only clean up if grace is still pending for this user
            if user_id not in self._grace_tickers:
                return
            saved = self._grace_tickers.pop(user_id, set())
            self._grace_tasks.pop(user_id, None)

            removed: list[str] = []
            for ticker in saved:
                # only untrack if no other clients are watching
                if not self._ticker_clients.get(ticker):
                    self._ticker_clients.pop(ticker, None)
                    removed.append(ticker)
            if removed:
                self._mark_untracked(removed)

        logger.info(
            "Grace expired for user=%s, untracked: %s",
            user_id,
            removed or "none",
        )

    async def subscribe(self, ws: WebSocket, tickers: list[str]) -> list[str]:
        """Subscribe a client to tickers. Returns newly tracked tickers."""
        added: list[str] = []
        async with self._lock:
            if ws not in self._subs:
                return []
            for t in tickers:
                ticker = t.upper()
                self._subs[ws].add(ticker)
                was_empty = len(self._ticker_clients[ticker]) == 0
                self._ticker_clients[ticker].add(ws)
                if was_empty:
                    self._ticker_last_active[ticker] = time.monotonic()
                    added.append(ticker)
            if added:
                self._mark_tracked(added)
        if added:
            logger.info("New tickers tracked: %s", added)
        return added

    async def unsubscribe(self, ws: WebSocket, tickers: list[str]) -> list[str]:
        """Unsubscribe a client from tickers. Returns tickers no longer tracked."""
        removed: list[str] = []
        async with self._lock:
            if ws not in self._subs:
                return []
            for t in tickers:
                ticker = t.upper()
                self._subs[ws].discard(ticker)
                self._ticker_clients[ticker].discard(ws)
                if not self._ticker_clients[ticker]:
                    del self._ticker_clients[ticker]
                    removed.append(ticker)
            if removed:
                self._mark_untracked(removed)
        if removed:
            logger.info("Tickers untracked: %s", removed)
        return removed

    async def broadcast(self, ticker: str, data: dict) -> None:
        """Send a quote update to all clients subscribed to a ticker."""
        async with self._lock:
            clients = list(self._ticker_clients.get(ticker, []))
            if clients:
                self._ticker_last_active[ticker] = time.monotonic()
        if not clients:
            return

        payload = json.dumps({"type": "quote", "ticker": ticker, "data": data})
        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        # clean up dead connections
        for ws in dead:
            await self.disconnect(ws)

    def get_user_tickers(self, user_id: str) -> set[str]:
        """Return the set of tickers a specific user is subscribed to
        across all their connections."""
        result: set[str] = set()
        for ws in self._user_connections.get(user_id, set()):
            result.update(self._subs.get(ws, set()))
        return result

    def get_user_for_ws(self, ws: WebSocket) -> str | None:
        """Return the user_id for a given WebSocket connection."""
        return self._ws_user.get(ws)

    @property
    def active_tickers(self) -> set[str]:
        return set(self._ticker_clients.keys())

    @property
    def client_count(self) -> int:
        return len(self._subs)

    @property
    def user_count(self) -> int:
        return len(self._user_connections)

    def least_active_ws_ticker(self, ws_subscribed: set[str]) -> str | None:
        candidates = {t: self._ticker_last_active.get(t, 0.0) for t in ws_subscribed}
        if not candidates:
            return None
        return min(candidates, key=lambda t: candidates[t])

    def drain_pending(self) -> tuple[list[str], list[str]]:
        """Return and clear pending ticker adds/removes for the feed."""
        adds = sorted(self._pending_adds)
        removes = sorted(self._pending_removes)
        self._pending_adds.clear()
        self._pending_removes.clear()
        return adds, removes
