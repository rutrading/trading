from app.config import get_config
from app.rate_limit.limiter import RateLimiter
from app.rate_limit.per_user import (
    Limit,
    PerUserRateLimiter,
    get_order_cancel_limiter,
    get_order_placement_limiter,
)

_alpaca_limiter: RateLimiter | None = None
_kalshi_limiter: RateLimiter | None = None


def get_alpaca_limiter() -> RateLimiter:
    """Return a shared rate limiter for all Alpaca REST calls."""
    global _alpaca_limiter
    if _alpaca_limiter is None:
        config = get_config()
        _alpaca_limiter = RateLimiter(config.alpaca_rate_limit, label="Alpaca")
    return _alpaca_limiter


def get_kalshi_limiter() -> RateLimiter:
    """Return a shared rate limiter for all Kalshi REST calls."""
    global _kalshi_limiter
    if _kalshi_limiter is None:
        config = get_config()
        _kalshi_limiter = RateLimiter(config.kalshi_rate_limit, label="Kalshi")
    return _kalshi_limiter


__all__ = [
    "Limit",
    "PerUserRateLimiter",
    "RateLimiter",
    "get_alpaca_limiter",
    "get_kalshi_limiter",
    "get_order_cancel_limiter",
    "get_order_placement_limiter",
]
