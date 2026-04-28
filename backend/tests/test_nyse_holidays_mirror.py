"""Drift guard for the NYSE holiday list duplicated across Python and TS.

Both `backend/app/services/market_calendar.py` and `web/src/lib/market-hours.ts`
maintain a hand-edited list of NYSE full-day holidays. They must agree, or the
backend and frontend will disagree about whether trading is allowed on a given
date — and the executor / placement guards will diverge from the UI.
"""

import re
from datetime import date, timedelta
from pathlib import Path

from app.services.market_calendar import NYSE_HOLIDAYS

_TS_PATH = Path(__file__).parents[2] / "web/src/lib/market-hours.ts"


def test_ts_holiday_list_matches_python() -> None:
    text = _TS_PATH.read_text()
    ts_dates = set(re.findall(r'"(\d{4}-\d{2}-\d{2})"', text))
    py_dates = {d.isoformat() for d in NYSE_HOLIDAYS}
    assert ts_dates == py_dates, (
        "NYSE holiday lists drifted between Python and TS. "
        f"Only in TS: {sorted(ts_dates - py_dates)}. "
        f"Only in Python: {sorted(py_dates - ts_dates)}."
    )


def test_nyse_holiday_set_covers_at_least_one_year_ahead() -> None:
    """Force a build break before the holiday set expires.

    When this test fails, extend NYSE_HOLIDAYS in
    backend/app/services/market_calendar.py (and the matching list in
    web/src/lib/market-hours.ts) with the next two years of NYSE full-day
    holidays. Source: https://www.nyse.com/markets/hours-calendars
    """
    today = date.today()
    one_year_ahead = today + timedelta(days=365)
    latest_holiday = max(NYSE_HOLIDAYS)
    assert latest_holiday >= one_year_ahead, (
        f"NYSE_HOLIDAYS only covers up to {latest_holiday}; today is {today}. "
        f"Extend the set with at least the next year's holidays."
    )
