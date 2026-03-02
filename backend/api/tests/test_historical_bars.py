from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.grpc_client import get_pipeline_client
from app.main import app


class _FakePipeline:
    async def fetch_historical_bars(self, symbol, timeframe, start, end):
        assert symbol == "AAPL"
        assert timeframe == "1Day"
        assert start == "2025-01-01T00:00:00Z"
        assert end == "2025-01-10T00:00:00Z"
        return SimpleNamespace(
            symbol="AAPL",
            timeframe="1Day",
            source="alpaca",
            bars=[
                SimpleNamespace(
                    timestamp=1735828200,
                    open=187.2,
                    high=188.1,
                    low=186.9,
                    close=187.8,
                    volume=1000,
                    vwap=187.5,
                    trade_count=80,
                )
            ],
        )


app.dependency_overrides[get_pipeline_client] = lambda: _FakePipeline()
client = TestClient(app)


def test_historical_bars_success():
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
