"""Sliding-window rate limiter with 90% usage warnings.

Tracks the exact number of requests in a rolling 60-second window using a deque
of timestamps. When usage hits 90% of the configured limit, logs a warning so
operators can see they're approaching the cap.
"""

import asyncio
import logging
import time
from collections import deque

logger = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, calls_per_minute: int, label: str = "API") -> None:
        self.limit = max(1, calls_per_minute)
        self.window = 60.0
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()
        self._warn_threshold = int(self.limit * 0.9)
        self._warned = False
        self._label = label

    def _purge_old(self, now: float) -> None:
        """Remove timestamps older than the sliding window."""
        cutoff = now - self.window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()

    @property
    def current_usage(self) -> int:
        """Number of requests made in the current sliding window."""
        self._purge_old(time.monotonic())
        return len(self._timestamps)

    async def acquire(self) -> None:
        """Wait until a request slot is available, then record the request."""
        async with self._lock:
            now = time.monotonic()
            self._purge_old(now)

            # window is full, wait until the oldest request expires
            if len(self._timestamps) >= self.limit:
                wait_until = self._timestamps[0] + self.window
                delay = wait_until - now
                if delay > 0:
                    logger.warning(
                        "Rate limit reached (%d/%d), waiting %.1fs",
                        len(self._timestamps),
                        self.limit,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    self._purge_old(time.monotonic())

            self._timestamps.append(time.monotonic())
            count = len(self._timestamps)

            # log a warning when approaching the limit
            if count >= self._warn_threshold and not self._warned:
                logger.warning(
                    f"{self._label} rate limit at 90%% (%d/%d requests in current window)",
                    count,
                    self.limit,
                )
                self._warned = True
            elif count < self._warn_threshold:
                # reset the flag once usage drops back below threshold
                self._warned = False
