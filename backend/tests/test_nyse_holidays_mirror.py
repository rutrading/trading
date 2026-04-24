"""Drift guard for the NYSE holiday list duplicated across Python and TS.

Both `backend/app/services/market_calendar.py` and `web/src/lib/market-hours.ts`
maintain a hand-edited list of NYSE full-day holidays. They must agree, or the
backend and frontend will disagree about whether trading is allowed on a given
date — and the executor / placement guards will diverge from the UI.
"""

import re
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
