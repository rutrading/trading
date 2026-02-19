"""Unit tests for the MarketData servicer."""

from unittest.mock import MagicMock, patch

import pytest

from trading_lib.config import Config


@pytest.fixture
def config():
    return Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
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
