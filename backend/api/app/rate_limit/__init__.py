from app.config import get_config
from app.rate_limit.limiter import RateLimiter

_alpaca_limiter: RateLimiter | None = None


def get_alpaca_limiter() -> RateLimiter:
    """Return a shared rate limiter for all Alpaca REST calls."""
    global _alpaca_limiter
    if _alpaca_limiter is None:
        config = get_config()
        _alpaca_limiter = RateLimiter(config.alpaca_rate_limit)
    return _alpaca_limiter


__all__ = ["RateLimiter", "get_alpaca_limiter"]
