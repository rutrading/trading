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
    ctx = MagicMock()
    ctx.set_code = MagicMock()
    ctx.set_details = MagicMock()
    return ctx


def _make_raw_quote(
    symbol="AAPL",
    price=150.0,
    open_=148.0,
    high=151.0,
    low=147.0,
    volume=50000000.0,
    timestamp=1700000000,
    raw=None,
):
    """Helper to create a mock raw quote."""
    quote = MagicMock()
    quote.symbol = symbol
    quote.price = price
    quote.open = open_
    quote.high = high
    quote.low = low
    quote.volume = volume
    quote.timestamp = timestamp
    quote.raw = raw or {}
    return quote


@pytest.mark.asyncio
async def test_transform_with_raw_data(servicer, context):
    """Transform should use change values from raw data."""
    request = MagicMock()
    request.raw_quote = _make_raw_quote(
        symbol="AAPL",
        price=150.0,
        open_=148.0,
        high=151.0,
        low=147.0,
        volume=50000000.0,
        timestamp=1700000000,
        raw={"change": "2.0", "percent_change": "1.35"},
    )

    result = await servicer.Transform(request, context)

    assert result.symbol == "AAPL"
    assert result.price == 150.0
    assert result.change == 2.0
    assert result.change_percent == 1.35
    assert result.open == 148.0
    assert result.high == 151.0
    assert result.low == 147.0
    assert result.volume == 50000000.0
    assert result.timestamp == 1700000000


@pytest.mark.asyncio
async def test_transform_zero_open(servicer, context):
    """Transform should handle zero open price without division error."""
    request = MagicMock()
    request.raw_quote = _make_raw_quote(
        symbol="TEST",
        price=100.0,
        open_=0.0,
        high=100.0,
        low=100.0,
        volume=0.0,
        timestamp=1700000000,
    )

    result = await servicer.Transform(request, context)

    assert result.change == 0.0
    assert result.change_percent == 0.0


@pytest.mark.asyncio
async def test_transform_negative_change(servicer, context):
    """Transform should correctly handle negative change from raw data."""
    request = MagicMock()
    request.raw_quote = _make_raw_quote(
        symbol="DOWN",
        price=95.0,
        open_=100.0,
        high=101.0,
        low=94.0,
        volume=1000000.0,
        timestamp=1700000000,
        raw={"change": "-5.0", "percent_change": "-5.0"},
    )

    result = await servicer.Transform(request, context)

    assert result.change == -5.0
    assert result.change_percent == -5.0


@pytest.mark.asyncio
async def test_transform_calculates_day_range_pct(servicer, context):
    """Transform should calculate day_range_pct from price position."""
    request = MagicMock()
    request.raw_quote = _make_raw_quote(
        symbol="AAPL",
        price=150.0,
        open_=148.0,
        high=152.0,
        low=146.0,
        volume=50000000.0,
        timestamp=1700000000,
    )

    result = await servicer.Transform(request, context)

    assert result.day_range_pct == pytest.approx(66.67, rel=0.01)


@pytest.mark.asyncio
async def test_transform_signal_bullish(servicer, context):
    """Transform should derive bullish signal correctly."""
    request = MagicMock()
    request.raw_quote = _make_raw_quote(
        symbol="AAPL",
        price=150.0,
        open_=148.0,
        high=151.0,
        low=147.0,
        volume=50000000.0,
        timestamp=1700000000,
        raw={"change": "2.0", "percent_change": "1.35", "average_volume": "40000000"},
    )

    result = await servicer.Transform(request, context)

    assert result.signal == "bullish"
