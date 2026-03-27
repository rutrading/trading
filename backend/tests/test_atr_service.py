"""Unit tests for the ATR computation service.

Tests the pure computation helpers directly and mocks DB/Alpaca for the
high-level compute_atr function.
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

from app.services.atr import _atr_from_db_bars, _atr_from_raw_bars, compute_atr


def make_db_bar(high: float, low: float, close: float) -> MagicMock:
    bar = MagicMock()
    bar.high = high
    bar.low = low
    bar.close = close
    return bar


def make_db_with_bars(bars: list) -> MagicMock:
    """Mock DB whose query chain returns the given bars list."""
    db = MagicMock()
    (
        db.query.return_value
        .filter.return_value
        .order_by.return_value
        .limit.return_value
        .all.return_value
    ) = bars
    return db


# ---------------------------------------------------------------------------
# _atr_from_db_bars — pure computation
# ---------------------------------------------------------------------------


class TestAtrFromDbBars:
    def test_single_period_atr(self):
        # 2 bars needed for 1 TR
        # bar1: close=$100, bar2: high=$110, low=$95 → TR = max(15, 10, 5) = 15
        bars = [
            make_db_bar(high=100, low=98, close=100),
            make_db_bar(high=110, low=95, close=105),
        ]
        result = _atr_from_db_bars(bars, n=1)
        assert result == Decimal("15")

    def test_atr_uses_prev_close_for_gaps(self):
        # bar1: close=$100; bar2: high=$102, low=$101 → TR using prev_close gap
        # high-low=1, |high-prev_close|=2, |low-prev_close|=1 → TR=2
        bars = [
            make_db_bar(high=100, low=99, close=100),
            make_db_bar(high=102, low=101, close=101),
        ]
        result = _atr_from_db_bars(bars, n=1)
        assert result == Decimal("2")

    def test_atr_averages_multiple_periods(self):
        # 3 bars → 2 TRs → ATR(2)
        # bar1 close=100; bar2: h=110, l=95 → TR=max(15, 10, 5)=15
        # bar2 close=105; bar3: h=108, l=102 → TR=max(6, 3, 3)=6
        # ATR(2) = (15 + 6) / 2 = 10.5
        bars = [
            make_db_bar(high=100, low=98, close=100),
            make_db_bar(high=110, low=95, close=105),
            make_db_bar(high=108, low=102, close=106),
        ]
        result = _atr_from_db_bars(bars, n=2)
        assert result == Decimal("10.5")


# ---------------------------------------------------------------------------
# _atr_from_raw_bars — same logic but raw Alpaca dict format
# ---------------------------------------------------------------------------


class TestAtrFromRawBars:
    def test_raw_bars_produce_correct_atr(self):
        raw = [
            {"h": 100, "l": 98, "c": 100},
            {"h": 110, "l": 95, "c": 105},
        ]
        result = _atr_from_raw_bars(raw, n=1)
        assert result == Decimal("15")


# ---------------------------------------------------------------------------
# compute_atr — high-level with DB and Alpaca fallback
# ---------------------------------------------------------------------------


class TestComputeAtr:
    def test_uses_db_bars_when_sufficient(self):
        # 15 bars → enough for n=14 ATR
        # All bars: high=115, low=100, close=100 → prev_close always=100 → TR always=15
        # Mock returns newest-first (as DB would); compute_atr reverses them internally.
        bars = [make_db_bar(high=115, low=100, close=100)] * 15
        db = make_db_with_bars(bars)

        result = compute_atr("AAPL", db, n=14)

        assert result == Decimal("15")

    def test_returns_zero_when_no_data_at_all(self):
        db = make_db_with_bars([])  # empty DB

        with patch("app.services.atr._fetch_bars_sync", return_value=[]):
            result = compute_atr("NEWCO", db, n=14)

        assert result == Decimal("0")

    def test_falls_back_to_alpaca_when_db_insufficient(self):
        # DB has only 5 bars — not enough for n=14
        db = make_db_with_bars([make_db_bar(100, 99, 100)] * 5)

        # Alpaca returns 15 bars: prev_close=100, then 14 bars with TR=10 each
        raw = [{"h": 100, "l": 99, "c": 100}]
        for _ in range(14):
            raw.append({"h": 110, "l": 100, "c": 105})

        with patch("app.services.atr._fetch_bars_sync", return_value=raw):
            result = compute_atr("AAPL", db, n=14)

        assert result == Decimal("10")
