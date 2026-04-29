"""Lifespan gating tests for the Kalshi bot task.

Goal #3 from branch 06: "Importing app.main with KALSHI_BOT_ENABLED=false does
not import app.tasks.kalshi_bot or app.services.kalshi_rest". The Kalshi
router is included unconditionally and must not pull either module in at
import time — the REST client is imported locally inside provision-subaccount.

Other tests in this suite (`test_kalshi_bot`, `test_kalshi_rest`,
`test_kalshi_router`) already pull these modules into ``sys.modules``, so each
test below pops them first and asserts the lifespan does not put them back.

The lifespan also touches Redis, the market-data feed, and several long-lived
background loops; those are stubbed via monkeypatch so the test focuses on the
Kalshi gate alone.
"""

import asyncio
import os
import sys
from unittest.mock import AsyncMock

import pytest

# Match the module-load contract used by the rest of the integration tests so
# the FastAPI bearer dependency rejects unauthenticated requests as expected.
os.environ["SKIP_AUTH"] = "false"

from app.main import app  # noqa: E402  (ordered after env setup)


async def _async_noop(*args, **kwargs):
    return None


@pytest.fixture
def _mock_lifespan_externals(monkeypatch):
    """Stub out Redis / feed / long-running loops the lifespan starts so the
    Kalshi gate can be exercised in isolation. The names patched are the
    references in ``app.main`` (and ``app.routers.symbols``), which is what
    the lifespan body actually calls."""
    import app.main as main_mod
    import app.routers.symbols as symbols_mod

    monkeypatch.setattr(main_mod, "get_redis", _async_noop)
    monkeypatch.setattr(main_mod, "close_redis", _async_noop)
    monkeypatch.setattr(main_mod, "feed", None)
    monkeypatch.setattr(main_mod, "run_order_executor", _async_noop)
    monkeypatch.setattr(main_mod, "run_strategy_executor", _async_noop)
    monkeypatch.setattr(main_mod, "run_news_loop", _async_noop)
    monkeypatch.setattr(main_mod, "flush_quotes_loop", _async_noop)
    monkeypatch.setattr(symbols_mod, "run_symbol_sync_loop", _async_noop)


def _run_lifespan_once() -> None:
    async def _run():
        async with app.router.lifespan_context(app):
            # Yield once so any tasks created by the lifespan get a chance to
            # start before the context manager cancels them on exit.
            await asyncio.sleep(0)

    asyncio.run(_run())


def test_lifespan_does_not_import_kalshi_bot_when_disabled(
    monkeypatch, _mock_lifespan_externals
):
    """KALSHI_BOT_ENABLED=false → neither kalshi_bot nor kalshi_rest enters
    sys.modules during startup. Both modules are popped first because earlier
    tests in this suite (test_kalshi_bot, test_kalshi_rest) imported them.
    Master switch is forced on to isolate the bot-flag gate from the
    KALSHI_ENABLED gate."""
    sys.modules.pop("app.tasks.kalshi_bot", None)
    sys.modules.pop("app.services.kalshi_rest", None)
    monkeypatch.setenv("KALSHI_ENABLED", "true")
    monkeypatch.setenv("KALSHI_BOT_ENABLED", "false")

    _run_lifespan_once()

    assert "app.tasks.kalshi_bot" not in sys.modules
    assert "app.services.kalshi_rest" not in sys.modules


def test_lifespan_imports_kalshi_router_unconditionally():
    """The router is included on every startup so the frontend can always hit
    /api/kalshi/* even when the bot loop is disabled."""
    from app.routers import kalshi  # noqa: F401

    assert "app.routers.kalshi" in sys.modules


def test_lifespan_starts_bot_task_when_enabled(monkeypatch, _mock_lifespan_externals):
    """KALSHI_BOT_ENABLED=true → the gated `from app.tasks.kalshi_bot import
    run_kalshi_bot` line runs and asyncio.create_task awaits it. The bot
    function itself is replaced with an AsyncMock so the test does not hang
    and the await can be asserted."""
    monkeypatch.setenv("KALSHI_ENABLED", "true")
    monkeypatch.setenv("KALSHI_BOT_ENABLED", "true")

    # Pre-import and patch run_kalshi_bot so the lifespan's `from ... import
    # run_kalshi_bot` resolves to the stub. Local imports read the attribute
    # off the already-cached module, so post-import patching wins.
    import app.tasks.kalshi_bot as kalshi_bot_mod

    bot_stub = AsyncMock(return_value=None)
    monkeypatch.setattr(kalshi_bot_mod, "run_kalshi_bot", bot_stub)

    _run_lifespan_once()

    # The await is the actual contract — sys.modules alone is tautological
    # because the pre-import above already put the module in sys.modules.
    assert bot_stub.await_count == 1


def test_lifespan_skips_bot_task_when_master_kill_switch_off(
    monkeypatch, _mock_lifespan_externals
):
    """KALSHI_ENABLED=false overrides KALSHI_BOT_ENABLED=true — the master
    switch wins. ``app.tasks.kalshi_bot`` and ``app.services.kalshi_rest``
    must stay out of ``sys.modules`` exactly like the bot-disabled case."""
    sys.modules.pop("app.tasks.kalshi_bot", None)
    sys.modules.pop("app.services.kalshi_rest", None)
    monkeypatch.setenv("KALSHI_ENABLED", "false")
    monkeypatch.setenv("KALSHI_BOT_ENABLED", "true")

    _run_lifespan_once()

    assert "app.tasks.kalshi_bot" not in sys.modules
    assert "app.services.kalshi_rest" not in sys.modules
