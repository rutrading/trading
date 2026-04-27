import pytest


def pytest_collection_modifyitems(items):
    for item in items:
        if item.get_closest_marker("anyio") is None and asyncio_test(item):
            item.add_marker(pytest.mark.anyio)


def asyncio_test(item) -> bool:
    import inspect

    return inspect.iscoroutinefunction(getattr(item, "function", None))


@pytest.fixture(autouse=True)
def _isolate_redis_from_dev_cache(monkeypatch):
    """Force `read_redis` to miss in every test by default.

    The dev `.env` points at a real Redis with cached quotes from prior
    `bun dev` sessions; without this any test that reaches `resolve_quote`
    finds a stale Redis hit at a different price (or `price=None`) and
    returns the wrong layer. Tests that exercise Redis-hit behaviour
    explicitly patch `app.services.quote_cache.read_redis` themselves and
    that patch supersedes this baseline."""

    async def _miss(_ticker):
        return None

    monkeypatch.setattr("app.services.quote_cache.read_redis", _miss)
