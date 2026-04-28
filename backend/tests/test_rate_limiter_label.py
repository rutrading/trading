"""Label plumbing for the shared RateLimiter.

The 90% warning message used to hardcode "Alpaca". After Kalshi joined the
codebase the limiter took a `label` arg so the warning can identify which
upstream is approaching its cap. These tests pin the wording so the Alpaca
log line keeps its original phrasing while Kalshi gets its own.
"""

import asyncio
import logging

import app.rate_limit as rate_limit_module
from app.rate_limit import get_alpaca_limiter, get_kalshi_limiter
from app.rate_limit.limiter import RateLimiter


def _drive_to_warn_threshold(limiter: RateLimiter) -> None:
    """Acquire enough slots to trip the 90% warning."""
    for _ in range(limiter._warn_threshold):
        asyncio.run(limiter.acquire())


def test_default_label_is_API(caplog) -> None:
    limiter = RateLimiter(10)
    with caplog.at_level(logging.WARNING, logger="app.rate_limit.limiter"):
        _drive_to_warn_threshold(limiter)
    assert any("API rate limit at 90%" in r.getMessage() for r in caplog.records)


def test_custom_label_appears_in_warning(caplog) -> None:
    limiter = RateLimiter(10, label="Kalshi")
    with caplog.at_level(logging.WARNING, logger="app.rate_limit.limiter"):
        _drive_to_warn_threshold(limiter)
    assert any(
        "Kalshi rate limit at 90%" in r.getMessage() for r in caplog.records
    )


def test_get_alpaca_limiter_uses_alpaca_label(caplog) -> None:
    """Regression: Alpaca's existing log wording must not change."""
    rate_limit_module._alpaca_limiter = None
    limiter = get_alpaca_limiter()
    assert limiter._label == "Alpaca"
    with caplog.at_level(logging.WARNING, logger="app.rate_limit.limiter"):
        _drive_to_warn_threshold(limiter)
    rate_limit_module._alpaca_limiter = None
    assert any(
        "Alpaca rate limit at 90%" in r.getMessage() for r in caplog.records
    )


def test_get_kalshi_limiter_singleton() -> None:
    rate_limit_module._kalshi_limiter = None
    first = get_kalshi_limiter()
    second = get_kalshi_limiter()
    assert first is second
    rate_limit_module._kalshi_limiter = None


def test_get_kalshi_limiter_uses_config_limit() -> None:
    from app.config import get_config

    rate_limit_module._kalshi_limiter = None
    limiter = get_kalshi_limiter()
    assert limiter.limit == get_config().kalshi_rate_limit
    assert limiter._label == "Kalshi"
    rate_limit_module._kalshi_limiter = None
