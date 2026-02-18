"""Unit tests for the Scheduler service and market-hours utilities."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from trading_lib.utils import is_market_open, is_quote_fresh, last_market_close


# ---------------------------------------------------------------------------
# is_market_open
# ---------------------------------------------------------------------------


def test_market_open_weekday_during_hours():
    """Market should be open on weekday during trading hours (UTC)."""
    # Wednesday 15:00 UTC = 10:00 AM ET (market open)
    mock_dt = datetime(2025, 1, 15, 15, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is True


def test_market_closed_weekend():
    """Market should be closed on weekends."""
    # Saturday 15:00 UTC
    mock_dt = datetime(2025, 1, 18, 15, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


def test_market_closed_before_open():
    """Market should be closed before 9:30 AM ET (14:30 UTC)."""
    # Wednesday 13:00 UTC = 8:00 AM ET (before open)
    mock_dt = datetime(2025, 1, 15, 13, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


def test_market_closed_after_close():
    """Market should be closed after 4:00 PM ET (21:00 UTC)."""
    # Wednesday 22:00 UTC = 5:00 PM ET (after close)
    mock_dt = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


# ---------------------------------------------------------------------------
# last_market_close
# ---------------------------------------------------------------------------


def test_last_close_weekday_after_close():
    """After market close on a weekday, last close should be today."""
    # Wednesday 22:00 UTC
    mock_dt = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = last_market_close()
        assert result == datetime(2025, 1, 15, 21, 0, tzinfo=timezone.utc)


def test_last_close_weekday_before_close():
    """Before market close on a weekday, last close should be previous day."""
    # Wednesday 15:00 UTC (market still open)
    mock_dt = datetime(2025, 1, 15, 15, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = last_market_close()
        # Previous business day = Tuesday
        assert result == datetime(2025, 1, 14, 21, 0, tzinfo=timezone.utc)


def test_last_close_saturday():
    """On Saturday, last close should be Friday."""
    mock_dt = datetime(2025, 1, 18, 12, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = last_market_close()
        assert result == datetime(2025, 1, 17, 21, 0, tzinfo=timezone.utc)


def test_last_close_sunday():
    """On Sunday, last close should be Friday."""
    mock_dt = datetime(2025, 1, 19, 12, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = last_market_close()
        assert result == datetime(2025, 1, 17, 21, 0, tzinfo=timezone.utc)


def test_last_close_monday_before_open():
    """On Monday before market open, last close should be Friday."""
    mock_dt = datetime(2025, 1, 20, 10, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        result = last_market_close()
        assert result == datetime(2025, 1, 17, 21, 0, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# is_quote_fresh
# ---------------------------------------------------------------------------


def test_fresh_none_updated_at():
    """A quote with no updated_at is always stale."""
    assert is_quote_fresh(None) is False


def test_fresh_during_market_hours():
    """During market hours, quote is fresh if age < staleness window."""
    # Wednesday 15:00 UTC (market open)
    now = datetime(2025, 1, 15, 15, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)

        # Updated 30s ago -> fresh
        recent = now - timedelta(seconds=30)
        assert is_quote_fresh(recent, staleness_seconds=60) is True

        # Updated 90s ago -> stale
        old = now - timedelta(seconds=90)
        assert is_quote_fresh(old, staleness_seconds=60) is False


def test_fresh_market_closed_with_closing_price():
    """After market close, quote updated after close is fresh."""
    # Wednesday 22:00 UTC (market closed, close was 21:00)
    now = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)

        # Updated at 21:30 (after close) -> fresh
        updated = datetime(2025, 1, 15, 21, 30, tzinfo=timezone.utc)
        assert is_quote_fresh(updated, staleness_seconds=60) is True


def test_stale_market_closed_without_closing_price():
    """After market close, quote updated before close is stale."""
    # Wednesday 22:00 UTC (market closed, close was 21:00)
    now = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)

        # Updated at 20:00 (before close) -> stale
        updated = datetime(2025, 1, 15, 20, 0, tzinfo=timezone.utc)
        assert is_quote_fresh(updated, staleness_seconds=60) is False


def test_fresh_weekend_with_friday_close():
    """On Saturday, quote updated after Friday's close is fresh."""
    # Saturday 12:00 UTC
    now = datetime(2025, 1, 18, 12, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)

        # Updated Friday 21:30 (after Friday close) -> fresh
        updated = datetime(2025, 1, 17, 21, 30, tzinfo=timezone.utc)
        assert is_quote_fresh(updated, staleness_seconds=60) is True

        # Updated Friday 20:00 (before Friday close) -> stale
        old = datetime(2025, 1, 17, 20, 0, tzinfo=timezone.utc)
        assert is_quote_fresh(old, staleness_seconds=60) is False


def test_fresh_naive_datetime():
    """is_quote_fresh should handle naive datetimes by assuming UTC."""
    now = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("trading_lib.utils.datetime") as mock_datetime:
        mock_datetime.now.return_value = now
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)

        # Naive datetime after close -> should be treated as UTC and be fresh
        updated = datetime(2025, 1, 15, 21, 30)
        assert is_quote_fresh(updated, staleness_seconds=60) is True
