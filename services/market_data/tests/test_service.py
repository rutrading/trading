"""Unit tests for the MarketData servicer."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

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


@pytest.mark.asyncio
async def test_get_quote_success(servicer, context):
    """GetQuote should return a valid QuoteResponse from TwelveData."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "symbol": "AAPL",
        "close": "150.25",
        "open": "148.50",
        "high": "151.00",
        "low": "147.75",
        "volume": "50000000",
    }

    with patch.object(servicer.client, "get", return_value=mock_response):
        # Create a mock request
        request = MagicMock()
        request.symbol = "AAPL"

        result = await servicer.GetQuote(request, context)

        assert result.symbol == "AAPL"
        assert result.price == 150.25
        assert result.open == 148.50
        assert result.high == 151.00
        assert result.low == 147.75
        assert result.volume == 50000000.0
        assert result.source == "twelvedata"
        assert result.timestamp > 0


@pytest.mark.asyncio
async def test_get_quote_symbol_not_found(servicer, context):
    """GetQuote should set NOT_FOUND when TwelveData returns an error code."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "code": 400,
        "message": "Symbol not found",
    }

    with patch.object(servicer.client, "get", return_value=mock_response):
        request = MagicMock()
        request.symbol = "INVALID"

        result = await servicer.GetQuote(request, context)

        context.set_code.assert_called_once()
        context.set_details.assert_called_once()


@pytest.mark.asyncio
async def test_get_quote_api_error(servicer, context):
    """GetQuote should handle HTTP errors gracefully."""
    import httpx

    mock_response = MagicMock()
    mock_response.status_code = 500

    with patch.object(
        servicer.client,
        "get",
        side_effect=httpx.HTTPStatusError(
            "Server Error", request=MagicMock(), response=mock_response
        ),
    ):
        request = MagicMock()
        request.symbol = "AAPL"

        result = await servicer.GetQuote(request, context)

        context.set_code.assert_called_once()


@pytest.mark.asyncio
async def test_bulk_fetch(servicer, context):
    """BulkFetch should call GetQuote for each symbol."""
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "symbol": "AAPL",
        "close": "150.00",
        "open": "148.00",
        "high": "151.00",
        "low": "147.00",
        "volume": "1000000",
    }

    with patch.object(servicer.client, "get", return_value=mock_response):
        request = MagicMock()
        request.symbols = ["AAPL", "GOOG"]

        result = await servicer.BulkFetch(request, context)

        assert len(result.quotes) == 2
