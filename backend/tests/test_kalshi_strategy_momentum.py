from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.strategies.kalshi.base import MarketSnapshot, OrderIntent
from app.strategies.kalshi.momentum import MomentumStrategy

NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def _ascending(n: int = 20, base: float = 100.0, step: float = 1.0) -> list[Decimal]:
    return [Decimal(str(base + i * step)) for i in range(n)]


def _descending(n: int = 20, base: float = 120.0, step: float = 1.0) -> list[Decimal]:
    return [Decimal(str(base - i * step)) for i in range(n)]


def _flat(n: int = 20, value: float = 100.0) -> list[Decimal]:
    return [Decimal(str(value)) for _ in range(n)]


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
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50")),
        Decimal("110"),
        _ascending(19),
        NOW,
    )
    assert result is None


def test_returns_none_too_close_to_close():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50"), close_time=NOW + timedelta(seconds=60)),
        Decimal("110"),
        _ascending(),
        NOW,
    )
    assert result is None


def test_returns_none_when_ema_equal():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(yes_ask=Decimal("0.50"), no_ask=Decimal("0.50")),
        Decimal("100"),
        _flat(),
        NOW,
    )
    assert result is None


def test_buy_yes_when_momentum_positive_and_spot_above_strike():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("100"),
            cap_strike=Decimal("100"),
            yes_ask=Decimal("0.50"),
        ),
        Decimal("120"),
        _ascending(),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "yes"
    assert result.action == "buy"
    assert result.count_fp == Decimal("1.00")
    assert result.limit_price_dollars == Decimal("0.50")
    assert result.rationale["strategy"] == "momentum"


def test_buy_no_when_momentum_negative_and_spot_below_strike():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("110"),
            cap_strike=Decimal("110"),
            no_ask=Decimal("0.50"),
        ),
        Decimal("100"),
        _descending(),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "no"
    assert result.action == "buy"
    assert result.limit_price_dollars == Decimal("0.50")


def test_skip_when_yes_ask_above_max_entry_price():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("100"),
            cap_strike=Decimal("100"),
            yes_ask=Decimal("0.85"),
        ),
        Decimal("120"),
        _ascending(),
        NOW,
    )
    assert result is None


def test_skip_when_yes_ask_missing():
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("100"),
            cap_strike=Decimal("100"),
            yes_ask=None,
        ),
        Decimal("120"),
        _ascending(),
        NOW,
    )
    assert result is None


def test_no_action_when_momentum_positive_but_spot_below_strike():
    """Direction mismatch: rising history but spot still below strike → None."""
    strat = MomentumStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("150"),
            cap_strike=Decimal("150"),
            yes_ask=Decimal("0.50"),
            no_ask=Decimal("0.50"),
        ),
        Decimal("110"),
        _ascending(),
        NOW,
    )
    assert result is None
