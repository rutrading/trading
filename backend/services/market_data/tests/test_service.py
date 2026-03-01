"""Unit tests for the MarketData servicer."""

from unittest.mock import MagicMock, patch

import pytest
from trading_lib.config import Config


@pytest.fixture
def config():
    return Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
        alpaca_api_key="alpaca_key",
        alpaca_secret_key="alpaca_secret",
        alpaca_data_base_url="https://data.alpaca.markets",
    )


@pytest.fixture
def servicer(config):
    from app.service import MarketDataServicer

    return MarketDataServicer(config)


@pytest.fixture
def context():
    ctx = MagicMock()
    ctx.set_code = MagicMock()
    ctx.set_details = MagicMock()
    return ctx


def _make_mock_response(data):
    """Create a properly mocked httpx response."""
    response = MagicMock()
    response.status_code = 200
    response.raise_for_status = MagicMock(return_value=None)
    response.json = MagicMock(return_value=data)
    return response


def _make_historical_request(
    symbol: str = "AAPL",
    timeframe: str = "1Day",
    start: str = "2025-01-01T00:00:00Z",
    end: str = "2025-01-10T00:00:00Z",
):
    request = MagicMock()
    request.symbol = symbol
    request.timeframe = timeframe
    request.start = start
    request.end = end
    return request


@pytest.mark.asyncio
async def test_fetch_success(servicer, context):
    """Fetch should return a valid response from TwelveData."""
    mock_response = _make_mock_response(
        {
            "symbol": "AAPL",
            "close": "150.25",
            "open": "148.50",
            "high": "151.00",
            "low": "147.75",
            "volume": "50000000",
        }
    )

    async def mock_get(*args, **kwargs):
        return mock_response

    with patch.object(servicer.client, "get", side_effect=mock_get):
        request = MagicMock()
        request.symbol = "AAPL"

        result = await servicer.Fetch(request, context)

        assert result.symbol == "AAPL"
        assert result.price == 150.25
        assert result.open == 148.50
        assert result.high == 151.00
        assert result.low == 147.75
        assert result.volume == 50000000.0
        assert result.source == "twelvedata"
        assert result.timestamp > 0


@pytest.mark.asyncio
async def test_fetch_symbol_not_found(servicer, context):
    """Fetch should set NOT_FOUND when TwelveData returns an error code."""
    mock_response = _make_mock_response(
        {
            "code": 400,
            "message": "Symbol not found",
        }
    )

    async def mock_get(*args, **kwargs):
        return mock_response

    with patch.object(servicer.client, "get", side_effect=mock_get):
        request = MagicMock()
        request.symbol = "INVALID"

        await servicer.Fetch(request, context)

        context.set_code.assert_called_once()
        context.set_details.assert_called_once()


@pytest.mark.asyncio
async def test_fetch_api_error(servicer, context):
    """Fetch should handle HTTP errors gracefully."""
    import httpx

    mock_error_response = MagicMock()
    mock_error_response.status_code = 500

    async def mock_get(*args, **kwargs):
        raise httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_error_response
        )

    with patch.object(servicer.client, "get", side_effect=mock_get):
        request = MagicMock()
        request.symbol = "AAPL"

        await servicer.Fetch(request, context)

        context.set_code.assert_called_once()


@pytest.mark.asyncio
async def test_bulk_fetch(servicer, context):
    """BulkFetch should call Fetch for each symbol."""
    mock_response = _make_mock_response(
        {
            "symbol": "AAPL",
            "close": "150.00",
            "open": "148.00",
            "high": "151.00",
            "low": "147.00",
            "volume": "1000000",
        }
    )

    async def mock_get(*args, **kwargs):
        return mock_response

    with patch.object(servicer.client, "get", side_effect=mock_get):
        request = MagicMock()
        request.symbols = ["AAPL", "GOOG"]

        result = await servicer.BulkFetch(request, context)

        assert len(result.quotes) == 2


@pytest.mark.asyncio
async def test_fetch_historical_bars_success(servicer, context):
    """FetchHistoricalBars should transform Alpaca bars for charting."""
    mock_response = _make_mock_response(
        {
            "symbol": "AAPL",
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
            ],
        }
    )

    async def mock_get(*args, **kwargs):
        return mock_response

    with patch.object(servicer.alpaca_client, "get", side_effect=mock_get):
        result = await servicer.FetchHistoricalBars(
            _make_historical_request(),
            context,
        )

        assert result.symbol == "AAPL"
        assert result.timeframe == "1Day"
        assert result.source == "alpaca"
        assert len(result.bars) == 1
        assert result.bars[0].open == 187.2
        assert result.bars[0].close == 187.8


@pytest.mark.asyncio
async def test_fetch_historical_bars_invalid_range(servicer, context):
    """FetchHistoricalBars should reject start >= end."""
    await servicer.FetchHistoricalBars(
        _make_historical_request(
            start="2025-01-10T00:00:00Z",
            end="2025-01-01T00:00:00Z",
        ),
        context,
    )

    context.set_code.assert_called_once()
    context.set_details.assert_called_once()
