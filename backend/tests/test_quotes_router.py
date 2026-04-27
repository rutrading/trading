"""Tests for the /api/quote REST endpoint.

The endpoint resolves through Redis -> Postgres -> Alpaca with a
field-completeness gate: a Redis or Postgres entry whose `price` is
None must NOT be returned, because `_handle_quote_tick` writes only
bid/ask to Redis and a partial state would otherwise reach the browser
on every page-load `getQuote()` call between trade ticks.

The resolution chain itself lives in `app.services.quote_cache`; the
patches below target that module.
"""

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app
from app.schemas import QuoteData

client = TestClient(app)


@contextmanager
def auth_override():
    app.dependency_overrides[get_current_user] = lambda: {"sub": "dev"}
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def _full_quote(ticker: str = "AAPL") -> QuoteData:
    return QuoteData(
        ticker=ticker,
        price=100.5,
        bid_price=100.4,
        ask_price=100.6,
        timestamp=1700000000,
        source="alpaca_rest",
    )


def _quote_only(ticker: str = "AAPL") -> QuoteData:
    """Mimics what `_handle_quote_tick` leaves in Redis between trades."""
    return QuoteData(
        ticker=ticker,
        bid_price=100.4,
        ask_price=100.6,
        timestamp=1700000000,
        source="alpaca_ws",
    )


def _freeze_now(monkeypatch, ts: int = 1700000010) -> None:
    """Pin `datetime.now()` inside the resolver so staleness arithmetic is deterministic."""
    from app.services import quote_cache

    class FakeDT:
        @staticmethod
        def now(tz=None):
            from datetime import datetime, timezone

            return datetime.fromtimestamp(ts, tz=timezone.utc)

    monkeypatch.setattr(quote_cache, "datetime", FakeDT)


class TestRedisCompletenessFallback:
    """Redis hits with a fresh timestamp but no `price` must fall through.

    Without this gate, the browser's `getQuote()` returns the partial
    state, the chart and order-form display nothing for the price, and
    the page sits in that state until the next upstream trade tick.
    """

    @patch("app.services.quote_cache._fetch_from_alpaca", new_callable=AsyncMock)
    @patch("app.services.quote_cache._read_from_postgres")
    @patch("app.services.quote_cache.write_redis", new_callable=AsyncMock)
    @patch("app.services.quote_cache.read_redis", new_callable=AsyncMock)
    def test_redis_quote_only_falls_through(
        self, mock_read, mock_write, mock_pg, mock_alpaca, monkeypatch
    ):
        _freeze_now(monkeypatch)
        mock_read.return_value = _quote_only()
        mock_pg.return_value = None
        mock_alpaca.return_value = _full_quote()

        with auth_override():
            response = client.get("/api/quote", params={"ticker": "AAPL"})

        assert response.status_code == 200
        body = response.json()
        assert body["price"] == 100.5
        assert body["cache_layer"] == "alpaca_rest"
        mock_alpaca.assert_awaited_once()

    @patch("app.services.quote_cache._fetch_from_alpaca", new_callable=AsyncMock)
    @patch("app.services.quote_cache._read_from_postgres")
    @patch("app.services.quote_cache.write_redis", new_callable=AsyncMock)
    @patch("app.services.quote_cache.read_redis", new_callable=AsyncMock)
    def test_redis_full_hit_returns_immediately(
        self, mock_read, mock_write, mock_pg, mock_alpaca, monkeypatch
    ):
        _freeze_now(monkeypatch)
        mock_read.return_value = _full_quote()
        mock_pg.return_value = None

        with auth_override():
            response = client.get("/api/quote", params={"ticker": "AAPL"})

        assert response.status_code == 200
        body = response.json()
        assert body["cache_layer"] == "redis"
        assert body["price"] == 100.5
        mock_alpaca.assert_not_called()

    @patch("app.services.quote_cache._fetch_from_alpaca", new_callable=AsyncMock)
    @patch("app.services.quote_cache._read_from_postgres")
    @patch("app.services.quote_cache.write_redis", new_callable=AsyncMock)
    @patch("app.services.quote_cache.read_redis", new_callable=AsyncMock)
    def test_postgres_quote_only_falls_through(
        self, mock_read, mock_write, mock_pg, mock_alpaca, monkeypatch
    ):
        _freeze_now(monkeypatch)
        mock_read.return_value = None
        mock_pg.return_value = _quote_only()
        mock_alpaca.return_value = _full_quote()

        with auth_override():
            response = client.get("/api/quote", params={"ticker": "AAPL"})

        assert response.status_code == 200
        body = response.json()
        assert body["cache_layer"] == "alpaca_rest"
        assert body["price"] == 100.5
        mock_alpaca.assert_awaited_once()
