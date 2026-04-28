"""NYSE market calendar.

Full-day closures only. Early-close days (day after Thanksgiving, Dec 24 when
it falls on a weekday, July 3 when July 4 is a Tuesday) are treated as normal
sessions since Alpaca still accepts orders during the reduced hours.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

# Observed NYSE full-day holidays. Keep in sync with
# https://www.nyse.com/markets/hours-calendars — extend through at least
# one year ahead of `today` (see
# tests/test_nyse_holidays_mirror.py::test_nyse_holiday_set_covers_at_least_one_year_ahead).
NYSE_HOLIDAYS: frozenset[date] = frozenset(
    date(y, m, d)
    for y, m, d in [
        (2025, 1, 1),    # New Year's Day
        (2025, 1, 20),   # Martin Luther King Jr. Day
        (2025, 2, 17),   # Presidents' Day
        (2025, 4, 18),   # Good Friday
        (2025, 5, 26),   # Memorial Day
        (2025, 6, 19),   # Juneteenth
        (2025, 7, 4),    # Independence Day
        (2025, 9, 1),    # Labor Day
        (2025, 11, 27),  # Thanksgiving
        (2025, 12, 25),  # Christmas
        (2026, 1, 1),
        (2026, 1, 19),
        (2026, 2, 16),
        (2026, 4, 3),
        (2026, 5, 25),
        (2026, 6, 19),
        (2026, 7, 3),    # July 4 falls on Saturday, observed Friday
        (2026, 9, 7),
        (2026, 11, 26),
        (2026, 12, 25),
        (2027, 1, 1),
        (2027, 1, 18),
        (2027, 2, 15),
        (2027, 3, 26),
        (2027, 5, 31),
        (2027, 6, 18),   # June 19 falls on Saturday, observed Friday
        (2027, 7, 5),    # July 4 falls on Sunday, observed Monday
        (2027, 9, 6),
        (2027, 11, 25),
        (2027, 12, 24),  # Dec 25 falls on Saturday, observed Friday
    ]
)

MARKET_OPEN = (9, 30)
MARKET_CLOSE = (16, 0)


def is_stock_market_open(now_et: datetime) -> bool:
    """True during regular US equity hours (9:30–16:00 ET) on a non-holiday weekday."""
    if now_et.weekday() >= 5:
        return False
    if now_et.date() in NYSE_HOLIDAYS:
        return False
    minutes = now_et.hour * 60 + now_et.minute
    return (MARKET_OPEN[0] * 60 + MARKET_OPEN[1]) <= minutes < (
        MARKET_CLOSE[0] * 60 + MARKET_CLOSE[1]
    )
