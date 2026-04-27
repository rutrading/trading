from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.strategies.kalshi.base import MarketSnapshot, OrderIntent
from app.strategies.kalshi.mean_reversion import MeanReversionStrategy

NOW = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


def _alternating(n: int = 30, low: float = 100.0, high: float = 101.0) -> list[Decimal]:
    return [Decimal(str(low if i % 2 == 0 else high)) for i in range(n)]


def _flat(n: int = 30, value: float = 100.0) -> list[Decimal]:
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
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(no_ask=Decimal("0.50")),
        Decimal("120"),
        _alternating(29),
        NOW,
    )
    assert result is None


def test_returns_none_with_zero_stdev():
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(no_ask=Decimal("0.50")),
        Decimal("120"),
        _flat(),
        NOW,
    )
    assert result is None


def test_returns_none_too_close_to_close():
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(no_ask=Decimal("0.50"), close_time=NOW + timedelta(seconds=60)),
        Decimal("120"),
        _alternating(),
        NOW,
    )
    assert result is None


def test_buy_no_when_stretched_up_and_above_strike():
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("110"),
            cap_strike=Decimal("110"),
            no_ask=Decimal("0.50"),
        ),
        Decimal("120"),
        _alternating(),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "no"
    assert result.action == "buy"
    assert result.count_fp == Decimal("1.00")
    assert result.limit_price_dollars == Decimal("0.50")
    assert result.rationale["strategy"] == "mean_reversion"


def test_buy_yes_when_stretched_down_and_below_strike():
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("90"),
            cap_strike=Decimal("90"),
            yes_ask=Decimal("0.50"),
        ),
        Decimal("80"),
        _alternating(),
        NOW,
    )
    assert isinstance(result, OrderIntent)
    assert result.side == "yes"
    assert result.action == "buy"
    assert result.limit_price_dollars == Decimal("0.50")


def test_no_action_when_stretched_up_but_below_strike():
    """z > 1.5 (spot well above mean) but spot still below strike → None."""
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("130"),
            cap_strike=Decimal("130"),
            yes_ask=Decimal("0.50"),
            no_ask=Decimal("0.50"),
        ),
        Decimal("120"),
        _alternating(),
        NOW,
    )
    assert result is None


def test_skip_when_relevant_ask_above_max_entry_price():
    strat = MeanReversionStrategy()
    result = strat.evaluate(
        _market(
            floor_strike=Decimal("110"),
            cap_strike=Decimal("110"),
            no_ask=Decimal("0.85"),
        ),
        Decimal("120"),
        _alternating(),
        NOW,
    )
    assert result is None
