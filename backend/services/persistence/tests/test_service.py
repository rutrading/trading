"""Unit tests for the Persistence servicer."""

from unittest.mock import MagicMock, patch

import pytest

from trading_lib.config import Config


@pytest.fixture
def config():
    return Config()


@pytest.fixture
def servicer(config):
    from app.service import PersistenceServicer

    return PersistenceServicer(config)


@pytest.fixture
def context():
    ctx = MagicMock()
    ctx.set_code = MagicMock()
    ctx.set_details = MagicMock()
    return ctx


def _make_persist_request(symbol="AAPL", price=150.0):
    """Helper to create a mock PersistRequest."""
    request = MagicMock()
    request.quote.symbol = symbol
    request.quote.price = price
    request.quote.open = 148.0
    request.quote.high = 151.0
    request.quote.low = 147.0
    request.quote.volume = 50000000.0
    request.quote.change = 2.0
    request.quote.change_percent = 1.35
    request.quote.timestamp = 1700000000
    return request


@pytest.mark.asyncio
async def test_persist_new_quote(servicer, context):
    """Persist should insert a new quote when symbol doesn't exist in DB."""
    mock_session = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = None
    mock_session.query.return_value = mock_query

    with patch("app.service.get_db", return_value=iter([mock_session])):
        request = _make_persist_request("AAPL", 150.0)
        result = await servicer.Persist(request, context)

        assert result.success is True
        assert result.symbol == "AAPL"
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_persist_update_existing(servicer, context):
    """Persist should update an existing quote."""
    existing = MagicMock()
    existing.symbol = "AAPL"

    mock_session = MagicMock()
    mock_query = MagicMock()
    mock_query.filter.return_value.first.return_value = existing
    mock_session.query.return_value = mock_query

    with patch("app.service.get_db", return_value=iter([mock_session])):
        request = _make_persist_request("AAPL", 155.0)
        result = await servicer.Persist(request, context)

        assert result.success is True
        assert existing.price == 155.0
        mock_session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_persist_db_error(servicer, context):
    """Persist should handle database errors gracefully."""
    with patch("app.service.get_db", side_effect=Exception("DB connection failed")):
        request = _make_persist_request("AAPL", 150.0)
        result = await servicer.Persist(request, context)

        assert result.success is False
        assert "DB connection failed" in result.message
        context.set_code.assert_called_once()
