from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.strategies.kalshi.base import MarketSnapshot, OrderIntent, derive_strike
from app.strategies.kalshi.threshold_drift import ThresholdDriftStrategy

NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def _history(n: int, *, vol: float = 0.001, base: float = 100.0) -> list[Decimal]:
    """n closes alternating ±vol around base, so realized log-return stdev > 0."""
    return [
        Decimal(str(base * (1 + vol * (1 if i % 2 == 0 else -1)))) for i in range(n)
    ]


def _market(
    *,
    ticker: str = "BTCD-26JAN0112-T100.0",
    floor_strike: Decimal | None = Decimal("100"),
    cap_strike: Decimal | None = Decimal("100"),
    yes_ask: Decimal | None = None,
    no_ask: Decimal | None = None,
    close_time: datetime = NOW + timedelta(minutes=5),
) -> MarketSnapshot:
    return MarketSnapshot(
        ticker=ticker,
        floor_strike=floor_strike,
        cap_strike=cap_strike,
        yes_bid_dollars=None,
        yes_ask_dollars=yes_ask,
        no_bid_dollars=None,
        no_ask_dollars=no_ask,
        yes_bid_size_fp=None,
        no_bid_size_fp=None,
        close_time=close_time,
        price_level_structure=None,
        fractional_trading_enabled=False,
    )


def test_returns_none_with_short_history():
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50")),
        Decimal("100"),
        _history(29),
        NOW,
    )
    assert result is None


def test_returns_none_with_zero_volatility():
    strat = ThresholdDriftStrategy()
    flat_history = [Decimal("100") for _ in range(30)]
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50")),
        Decimal("100"),
        flat_history,
        NOW,
    )
    assert result is None


def test_returns_none_too_close_to_close():
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50"), close_time=NOW + timedelta(seconds=60)),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert result is None


def test_returns_none_with_missing_strike():
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(floor_strike=None, cap_strike=None, yes_ask=Decimal("0.50")),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert result is None


def test_returns_none_with_missing_yes_ask_when_signal_is_yes():
    """Spot far above strike → fair YES ≈ 1.0, but yes_ask=None and no_ask=None
    leaves nothing to act on."""
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("80"),
            cap_strike=Decimal("80"),
            yes_ask=None,
            no_ask=None,
        ),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert result is None


def test_buy_yes_when_yes_underpriced():
    """Spot=100 well above strike=80 → fair_yes ≈ 1.0; yes_ask=0.50 → edge ≈ 0.50."""
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("80"),
            cap_strike=Decimal("80"),
            yes_ask=Decimal("0.50"),
        ),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "yes"
    assert result.action == "buy"
    assert result.count_fp == Decimal("1.00")
    assert result.limit_price_dollars == Decimal("0.50")
    assert result.rationale["strategy"] == "threshold_drift"


def test_buy_no_when_no_underpriced():
    """Spot=100 well below strike=120 → fair_yes ≈ 0; no_ask=0.40 → 1-fair-no_ask ≈ 0.60."""
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("120"),
            cap_strike=Decimal("120"),
            yes_ask=Decimal("0.50"),
            no_ask=Decimal("0.40"),
        ),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "no"
    assert result.action == "buy"
    assert result.limit_price_dollars == Decimal("0.40")


def test_no_signal_when_edge_below_threshold():
    """Spot==strike → fair_yes ≈ 0.5; yes_ask=0.49, no_ask=0.49 → both edges ≈ 0.01 < 0.05."""
    strat = ThresholdDriftStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("100"),
            cap_strike=Decimal("100"),
            yes_ask=Decimal("0.49"),
            no_ask=Decimal("0.49"),
        ),
        Decimal("100"),
        _history(30),
        NOW,
    )
    assert result is None


def test_uses_floor_strike_when_cap_missing():
    market = _market(
        floor_strike=Decimal("123"),
        cap_strike=None,
    )
    assert derive_strike(market) == Decimal("123")


def test_midpoint_strike_when_both_present():
    market = _market(
        floor_strike=Decimal("100"),
        cap_strike=Decimal("200"),
    )
    assert derive_strike(market) == Decimal("150")
