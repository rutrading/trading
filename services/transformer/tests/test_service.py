"""Unit tests for the Transformer servicer."""

from unittest.mock import MagicMock

import pytest

from trading_lib.config import Config


@pytest.fixture
def config():
    return Config()


@pytest.fixture
def servicer(config):
    from app.service import TransformerServicer

    return TransformerServicer(config)


@pytest.fixture
def context():
    return MagicMock()


@pytest.mark.asyncio
async def test_transform_calculates_change(servicer, context):
    """Transform should calculate change and change_percent correctly."""
    request = MagicMock()
    request.raw_quote.symbol = "AAPL"
    request.raw_quote.price = 150.0
    request.raw_quote.open = 148.0
    request.raw_quote.high = 151.0
    request.raw_quote.low = 147.0
    request.raw_quote.volume = 50000000.0
    request.raw_quote.timestamp = 1700000000

    result = await servicer.Transform(request, context)

    assert result.symbol == "AAPL"
    assert result.price == 150.0
    assert result.change == 2.0
    assert result.change_percent == pytest.approx(1.3514, rel=1e-2)
    assert result.open == 148.0
    assert result.high == 151.0
    assert result.low == 147.0
    assert result.volume == 50000000.0
    assert result.timestamp == 1700000000


@pytest.mark.asyncio
async def test_transform_zero_open(servicer, context):
    """Transform should handle zero open price without division error."""
    request = MagicMock()
    request.raw_quote.symbol = "TEST"
    request.raw_quote.price = 100.0
    request.raw_quote.open = 0.0
    request.raw_quote.high = 100.0
    request.raw_quote.low = 100.0
    request.raw_quote.volume = 0.0
    request.raw_quote.timestamp = 1700000000

    result = await servicer.Transform(request, context)

    assert result.change == 0.0
    assert result.change_percent == 0.0


@pytest.mark.asyncio
async def test_transform_negative_change(servicer, context):
    """Transform should correctly calculate negative change."""
    request = MagicMock()
    request.raw_quote.symbol = "DOWN"
    request.raw_quote.price = 95.0
    request.raw_quote.open = 100.0
    request.raw_quote.high = 101.0
    request.raw_quote.low = 94.0
    request.raw_quote.volume = 1000000.0
    request.raw_quote.timestamp = 1700000000

    result = await servicer.Transform(request, context)

    assert result.change == -5.0
    assert result.change_percent == pytest.approx(-5.0, rel=1e-2)


@pytest.mark.asyncio
async def test_bulk_transform(servicer, context):
    """BulkTransform should transform all quotes."""
    raw1 = MagicMock()
    raw1.symbol = "AAPL"
    raw1.price = 150.0
    raw1.open = 148.0
    raw1.high = 151.0
    raw1.low = 147.0
    raw1.volume = 50000000.0
    raw1.timestamp = 1700000000

    raw2 = MagicMock()
    raw2.symbol = "GOOG"
    raw2.price = 140.0
    raw2.open = 138.0
    raw2.high = 141.0
    raw2.low = 137.0
    raw2.volume = 30000000.0
    raw2.timestamp = 1700000000

    request = MagicMock()
    request.raw_quotes = [raw1, raw2]

    result = await servicer.BulkTransform(request, context)

    assert len(result.quotes) == 2
    assert result.quotes[0].symbol == "AAPL"
    assert result.quotes[1].symbol == "GOOG"
