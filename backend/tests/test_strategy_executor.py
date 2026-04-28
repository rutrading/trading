from datetime import datetime
from zoneinfo import ZoneInfo

from app.tasks.strategy_executor import _is_market_hours

ET = ZoneInfo("America/New_York")


def test_market_hours_true_during_session():
    dt = datetime(2026, 4, 20, 10, 0, tzinfo=ET)  # Monday
    assert _is_market_hours(dt) is True


def test_market_hours_false_before_open():
    dt = datetime(2026, 4, 20, 9, 0, tzinfo=ET)
    assert _is_market_hours(dt) is False


def test_market_hours_false_on_weekend():
    dt = datetime(2026, 4, 19, 11, 0, tzinfo=ET)  # Sunday
    assert _is_market_hours(dt) is False
