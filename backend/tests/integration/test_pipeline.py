"""Integration tests for the full gRPC pipeline.

Verifies the flow: MarketData -> Transformer -> Persistence -> DB
using mocked external APIs and database sessions.
"""

import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from trading_lib.config import Config


def _find_generated_dir():
    """Find a generated/ directory from any service."""
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "services" / svc / "generated"
        for svc in ["market_data", "transformer", "persistence", "scheduler"]
    ]
    for c in candidates:
        if c.exists() and (c / "market_data_pb2.py").exists():
            return c
    return None


@pytest.fixture(scope="session", autouse=True)
def add_generated_to_path():
    """Add generated proto code to sys.path for the test session."""
    gen_dir = _find_generated_dir()
    if gen_dir and str(gen_dir.parent) not in sys.path:
        sys.path.insert(0, str(gen_dir.parent))
    if gen_dir and str(gen_dir) not in sys.path:
        sys.path.insert(0, str(gen_dir))


@pytest.fixture
def config():
    return Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
        market_data_host="localhost:50051",
        transformer_host="localhost:50052",
        persistence_host="localhost:50053",
    )


@pytest.mark.asyncio
async def test_transformer_calculates_change():
    """Transformer should use change/percent_change from raw TwelveData data."""
    from trading_lib.config import Config

    from services.transformer.app.service import TransformerServicer

    servicer = TransformerServicer(Config())
    context = MagicMock()

    request = MagicMock()
    request.raw_quote.symbol = "AAPL"
    request.raw_quote.price = 155.0
    request.raw_quote.open = 150.0
    request.raw_quote.high = 156.0
    request.raw_quote.low = 149.0
    request.raw_quote.volume = 60000000.0
    request.raw_quote.timestamp = int(time.time())
    request.raw_quote.raw = {
        "change": "5.0",
        "percent_change": "3.3333",
        "previous_close": "150.0",
        "name": "Apple Inc.",
        "exchange": "NASDAQ",
        "currency": "USD",
        "is_market_open": "true",
        "average_volume": "50000000",
    }

    result = await servicer.Transform(request, context)

    assert result.symbol == "AAPL"
    assert result.price == 155.0
    assert result.change == pytest.approx(5.0)
    assert result.change_percent == pytest.approx(3.3333, rel=1e-2)
    assert result.name == "Apple Inc."
    assert result.signal in ("bullish", "bearish", "neutral")


@pytest.mark.asyncio
async def test_market_data_to_transformer_flow():
    """MarketData Fetch -> Transformer Transform should produce correct output."""
    from trading_lib.config import Config

    from services.market_data.app.service import MarketDataServicer
    from services.transformer.app.service import TransformerServicer

    config = Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
    )

    md_servicer = MarketDataServicer(config)
    tf_servicer = TransformerServicer(config)
    context = MagicMock()
    context.set_code = MagicMock()
    context.set_details = MagicMock()

    # Mock TwelveData response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "symbol": "TSLA",
        "close": "250.00",
        "open": "245.00",
        "high": "252.00",
        "low": "243.00",
        "volume": "80000000",
        "change": "5.00",
        "percent_change": "2.0408",
        "previous_close": "245.00",
        "name": "Tesla Inc.",
        "exchange": "NASDAQ",
        "currency": "USD",
        "is_market_open": "false",
        "average_volume": "70000000",
    }

    with patch.object(md_servicer.client, "get", return_value=mock_response):
        # Step 1: Fetch
        md_request = MagicMock()
        md_request.symbol = "TSLA"
        raw_quote = await md_servicer.Fetch(md_request, context)

        assert raw_quote.symbol == "TSLA"
        assert raw_quote.price == 250.0

        # Step 2: Transform
        tf_request = MagicMock()
        tf_request.raw_quote = raw_quote
        transformed = await tf_servicer.Transform(tf_request, context)

        assert transformed.symbol == "TSLA"
        assert transformed.price == 250.0
        assert transformed.change == pytest.approx(5.0)
        assert transformed.change_percent == pytest.approx(2.0408, rel=1e-2)


@pytest.mark.asyncio
async def test_persistence_persists_to_db():
    """Persistence should save a transformed quote to the database."""
    from trading_lib.config import Config

    from services.persistence.app.service import PersistenceServicer

    servicer = PersistenceServicer(Config())
    context = MagicMock()

    mock_session = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = None
    mock_session.query.return_value = mock_query

    with patch("trading_lib.utils.get_db", return_value=iter([mock_session])):
        request = MagicMock()
        request.quote.symbol = "AAPL"
        request.quote.price = 150.0
        request.quote.open = 148.0
        request.quote.high = 151.0
        request.quote.low = 147.0
        request.quote.volume = 50000000.0
        request.quote.change = 2.0
        request.quote.change_percent = 1.35
        request.quote.timestamp = 1700000000

        result = await servicer.Persist(request, context)

        assert result.success is True
        assert result.symbol == "AAPL"
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_full_pipeline_mock():
    """Full pipeline: MarketData -> Transformer -> Persistence with mocked externals."""
    from trading_lib.config import Config

    from services.market_data.app.service import MarketDataServicer
    from services.persistence.app.service import PersistenceServicer
    from services.transformer.app.service import TransformerServicer

    config = Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
    )

    md_servicer = MarketDataServicer(config)
    tf_servicer = TransformerServicer(config)
    ps_servicer = PersistenceServicer(config)
    context = MagicMock()
    context.set_code = MagicMock()
    context.set_details = MagicMock()

    # Mock TwelveData
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = {
        "symbol": "GOOG",
        "close": "175.50",
        "open": "173.00",
        "high": "176.00",
        "low": "172.00",
        "volume": "25000000",
        "change": "2.50",
        "percent_change": "1.4451",
        "previous_close": "173.00",
        "name": "Alphabet Inc.",
        "exchange": "NASDAQ",
        "currency": "USD",
        "is_market_open": "false",
        "average_volume": "20000000",
    }

    # Mock DB
    mock_session = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = None
    mock_session.query.return_value = mock_query

    with (
        patch.object(md_servicer.client, "get", return_value=mock_response),
        patch("trading_lib.utils.get_db", return_value=iter([mock_session])),
    ):
        # Step 1: MarketData
        md_request = MagicMock()
        md_request.symbol = "GOOG"
        raw = await md_servicer.Fetch(md_request, context)
        assert raw.symbol == "GOOG"
        assert raw.price == 175.5

        # Step 2: Transformer
        tf_request = MagicMock()
        tf_request.raw_quote = raw
        transformed = await tf_servicer.Transform(tf_request, context)
        assert transformed.symbol == "GOOG"
        assert transformed.change == pytest.approx(2.5)

        # Step 3: Persistence
        ps_request = MagicMock()
        ps_request.quote = transformed
        result = await ps_servicer.Persist(ps_request, context)
        assert result.success is True
        assert result.symbol == "GOOG"
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_pipeline_handles_api_failure():
    """Pipeline should handle TwelveData API failures gracefully."""
    from trading_lib.config import Config

    from services.market_data.app.service import MarketDataServicer

    config = Config(
        twelve_data_api_key="test_key",
        twelve_data_base_url="https://api.twelvedata.com",
    )

    servicer = MarketDataServicer(config)
    context = MagicMock()
    context.set_code = MagicMock()
    context.set_details = MagicMock()

    with patch.object(
        servicer.client,
        "get",
        side_effect=Exception("Connection refused"),
    ):
        request = MagicMock()
        request.symbol = "FAIL"
        await servicer.Fetch(request, context)

        context.set_code.assert_called_once()
        context.set_details.assert_called_once()
