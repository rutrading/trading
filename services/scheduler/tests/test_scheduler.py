"""Unit tests for the Scheduler service."""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest


def test_market_open_weekday_during_hours():
    """Market should be open on weekday during trading hours (UTC)."""
    from app.service import is_market_open

    # Wednesday 15:00 UTC = 10:00 AM ET (market open)
    mock_dt = datetime(2025, 1, 15, 15, 0, tzinfo=timezone.utc)
    with patch("app.service.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is True


def test_market_closed_weekend():
    """Market should be closed on weekends."""
    from app.service import is_market_open

    # Saturday 15:00 UTC
    mock_dt = datetime(2025, 1, 18, 15, 0, tzinfo=timezone.utc)
    with patch("app.service.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


def test_market_closed_before_open():
    """Market should be closed before 9:30 AM ET (14:30 UTC)."""
    from app.service import is_market_open

    # Wednesday 13:00 UTC = 8:00 AM ET (before open)
    mock_dt = datetime(2025, 1, 15, 13, 0, tzinfo=timezone.utc)
    with patch("app.service.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


def test_market_closed_after_close():
    """Market should be closed after 4:00 PM ET (21:00 UTC)."""
    from app.service import is_market_open

    # Wednesday 22:00 UTC = 5:00 PM ET (after close)
    mock_dt = datetime(2025, 1, 15, 22, 0, tzinfo=timezone.utc)
    with patch("app.service.datetime") as mock_datetime:
        mock_datetime.now.return_value = mock_dt
        mock_datetime.side_effect = lambda *a, **kw: datetime(*a, **kw)
        assert is_market_open() is False


def test_default_symbols():
    """Scheduler should have default symbols configured."""
    from trading_lib.config import Config

    from app.service import Scheduler

    scheduler = Scheduler(Config())
    assert len(scheduler.symbols) > 0
    assert "AAPL" in scheduler.symbols
