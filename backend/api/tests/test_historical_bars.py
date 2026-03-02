import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.main import app

client = TestClient(app)


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user] = lambda: {"sub": "dev"}
    yield
    app.dependency_overrides.pop(get_current_user, None)


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
