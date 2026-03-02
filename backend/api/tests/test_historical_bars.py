import os
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app

client = TestClient(app)


@contextmanager
def auth_override():
    app.dependency_overrides[get_current_user] = lambda: {"sub": "dev"}
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


@patch("app.routers.historical_bars.httpx.AsyncClient.get", new_callable=AsyncMock)
def test_historical_bars_success(mock_get: AsyncMock):
    os.environ["ALPACA_API_KEY"] = "test_key"
    os.environ["ALPACA_SECRET_KEY"] = "test_secret"
    os.environ["ALPACA_RATE_LIMIT"] = "600"

    mock_get.return_value = _FakeResponse(
        {
            "bars": [
                {
                    "t": "2025-01-02T14:30:00Z",
                    "o": 187.2,
                    "h": 188.1,
                    "l": 186.9,
                    "c": 187.8,
                    "v": 1000,
                    "vw": 187.5,
                    "n": 80,
                }
            ]
        }
    )

    with auth_override():
        response = client.post(
            "/api/historical-bars",
            json={
                "symbol": "aapl",
                "timeframe": "1Day",
                "start": "2025-01-01T00:00:00Z",
                "end": "2025-01-10T00:00:00Z",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "AAPL"
    assert payload["timeframe"] == "1Day"
    assert payload["source"] == "alpaca"
    assert len(payload["bars"]) == 1
    assert payload["bars"][0]["close"] == 187.8


def test_historical_bars_invalid_timeframe():
    with auth_override():
        response = client.post(
            "/api/historical-bars",
            json={
                "symbol": "AAPL",
                "timeframe": "2Day",
                "start": "2025-01-01T00:00:00Z",
                "end": "2025-01-10T00:00:00Z",
            },
        )

    assert response.status_code == 422


@patch("app.routers.historical_bars._get_alpaca_rate_limiter")
@patch("app.routers.historical_bars.httpx.AsyncClient.get", new_callable=AsyncMock)
def test_historical_bars_uses_rate_limiter(
    mock_get: AsyncMock,
    mock_get_limiter,
):
    os.environ["ALPACA_API_KEY"] = "test_key"
    os.environ["ALPACA_SECRET_KEY"] = "test_secret"
    os.environ["ALPACA_RATE_LIMIT"] = "321"

    limiter = SimpleNamespace(acquire=AsyncMock())
    mock_get_limiter.return_value = limiter
    mock_get.return_value = _FakeResponse({"bars": []})

    with auth_override():
        response = client.post(
            "/api/historical-bars",
            json={
                "symbol": "AAPL",
                "timeframe": "1Day",
                "start": "2025-01-01T00:00:00Z",
                "end": "2025-01-10T00:00:00Z",
            },
        )

    assert response.status_code == 200
    mock_get_limiter.assert_called_once_with(321)
    limiter.acquire.assert_awaited_once()
