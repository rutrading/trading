"""Per-user sliding-window rate limiter used to throttle order placement and
cancellation.

The existing `RateLimiter` in `limiter.py` is a single global window for
outbound Alpaca traffic. Per-user limits on inbound order traffic need a
separate data structure: one sliding window per user (plus a second short
window to catch bursts). A stuck client or malicious loop can otherwise
hammer `POST /orders` with no server-side cap — each call grabs a row lock
on the trading account and runs ATR + buying-power math, so a few clients
can saturate the DB.

Design:
  - Each limit is a (max_requests, window_seconds) pair.
  - A PerUserRateLimiter holds a list of limits (e.g. 5/sec and 30/min).
  - State is kept in an in-process dict keyed by user id. A request is
    admitted only if it fits under every configured window. On rejection we
    raise HTTPException(429).
  - Old timestamp dequeues are purged lazily on each acquire call. Empty
    entries are GC'd when no timestamps remain.

This is deliberately an in-process limiter — paper trading workloads are
single-node today. If the backend ever scales horizontally, move this to
Redis.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Limit:
    max_requests: int
    window_seconds: float


class PerUserRateLimiter:
    """Sliding-window rate limiter with per-user keys and multiple windows.

    Thread/task safety: one asyncio.Lock guarding all shared state. Order
    placement is low-volume per user (never hot in the sense of microseconds
    of contention), so a single lock is fine.
    """

    def __init__(self, limits: list[Limit], label: str = "rate_limit") -> None:
        if not limits:
            raise ValueError("at least one limit is required")
        self.limits = limits
        self.label = label
        # user_id -> deque of monotonic timestamps
        self._timestamps: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()
        # longest window we need to retain timestamps for
        self._max_window = max(limit.window_seconds for limit in limits)

    async def check(self, user_id: str) -> None:
        """Admit or reject a request for the given user.

        Raises HTTPException(429) if any configured window is full.
        """
        if not user_id:
            # Defense in depth — if somehow the identity layer handed us an
            # empty sub, don't key everyone under the same empty bucket.
            return

        async with self._lock:
            now = time.monotonic()
            timestamps = self._timestamps[user_id]
            cutoff = now - self._max_window
            while timestamps and timestamps[0] < cutoff:
                timestamps.popleft()

            # Check each window — a request is admitted only if it fits under
            # every configured limit.
            for limit in self.limits:
                window_cutoff = now - limit.window_seconds
                # Count how many existing timestamps fall inside this window.
                count = sum(1 for ts in timestamps if ts >= window_cutoff)
                if count >= limit.max_requests:
                    logger.warning(
                        "%s: user=%s hit limit %d/%ds (current=%d)",
                        self.label,
                        user_id,
                        limit.max_requests,
                        int(limit.window_seconds),
                        count,
                    )
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=(
                            "Too many requests. Slow down — "
                            f"limit is {limit.max_requests} per "
                            f"{int(limit.window_seconds)}s."
                        ),
                    )

            timestamps.append(now)

            # Drop empty entries to keep the dict bounded if the process runs
            # for a long time.
            if not timestamps:
                self._timestamps.pop(user_id, None)


# Shared limiters for order-mutation endpoints. Per the audit recommendation:
# "30 orders/min and 5 orders/sec." Applied to both POST /orders and
# POST /orders/{id}/cancel since cancellation triggers the same row-lock +
# reservation-release work.
_order_placement_limiter: PerUserRateLimiter | None = None
_order_cancel_limiter: PerUserRateLimiter | None = None


def get_order_placement_limiter() -> PerUserRateLimiter:
    global _order_placement_limiter
    if _order_placement_limiter is None:
        _order_placement_limiter = PerUserRateLimiter(
            limits=[Limit(max_requests=5, window_seconds=1), Limit(max_requests=30, window_seconds=60)],
            label="order_placement",
        )
    return _order_placement_limiter


def get_order_cancel_limiter() -> PerUserRateLimiter:
    global _order_cancel_limiter
    if _order_cancel_limiter is None:
        _order_cancel_limiter = PerUserRateLimiter(
            limits=[Limit(max_requests=5, window_seconds=1), Limit(max_requests=30, window_seconds=60)],
            label="order_cancel",
        )
    return _order_cancel_limiter


def _reset_for_tests() -> None:
    """Reset the shared limiters. Tests call this in fixtures to isolate state."""
    global _order_placement_limiter, _order_cancel_limiter
    _order_placement_limiter = None
    _order_cancel_limiter = None
