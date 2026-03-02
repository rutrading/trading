import asyncio
import time


class RateLimiter:
    def __init__(self, calls_per_minute: int):
        self.interval = 60.0 / max(1, calls_per_minute)
        self.last_call = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_call
            if elapsed < self.interval:
                await asyncio.sleep(self.interval - elapsed)
            self.last_call = time.time()
