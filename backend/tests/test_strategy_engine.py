from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.strategy_engine import run_backtest
from tests.integration_helpers import (
    make_session_factory,
    make_test_engine,
    seed_daily_bar,
    seed_symbol,
)


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


def _seed_bars(db, ticker: str, closes: list[float], start: date) -> None:
    for index, close in enumerate(closes):
        bar_date = start + timedelta(days=index)
        seed_daily_bar(
            db,
            ticker,
            bar_date=bar_date,
            open_=close,
            high=close + 1,
            low=max(close - 1, 0),
            close=close,
            volume=1_000_000,
        )


def test_run_backtest_executes_round_trip_on_ema_cross(session_factory):
    closes = [10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 14, 13]
    start_date = date(2026, 1, 1)

    with session_factory() as db:
        seed_symbol(db, "AAPL")
        _seed_bars(db, "AAPL", closes, start_date)

        result = run_backtest(
            db=db,
            strategy_type="ema_crossover",
            symbols=["AAPL"],
            timeframe="1Day",
            params_json={
                "fast_period": 2,
                "slow_period": 4,
                "order_quantity": "1",
            },
            risk_json={
                "max_position_quantity": "5",
                "max_daily_orders": 5,
                "cooldown_minutes": 0,
                "max_daily_notional": "1000",
            },
            capital_allocation=Decimal("100"),
            start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end=datetime(2026, 1, 31, tzinfo=timezone.utc),
        )

    trades = result["trades"]
    assert [trade.side for trade in trades] == ["buy", "sell"]
    assert trades[0].price == Decimal("11.0")
    assert trades[1].price == Decimal("13.0")
    assert trades[1].profit == Decimal("2.0")
    assert result["win_rate"] == 1.0
    assert result["avg_return_per_trade"] > 0
    assert Decimal(result["ending_equity"]) == Decimal("102.0")
    assert len(result["equity_curve"]) == len(closes)


def test_run_backtest_respects_daily_notional_limit(session_factory):
    closes = [10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 14, 13]
    start_date = date(2026, 1, 1)

    with session_factory() as db:
        seed_symbol(db, "AAPL")
        _seed_bars(db, "AAPL", closes, start_date)

        result = run_backtest(
            db=db,
            strategy_type="ema_crossover",
            symbols=["AAPL"],
            timeframe="1Day",
            params_json={
                "fast_period": 2,
                "slow_period": 4,
                "order_quantity": "1",
            },
            risk_json={
                "max_position_quantity": "5",
                "max_daily_orders": 5,
                "cooldown_minutes": 0,
                "max_daily_notional": "5",
            },
            capital_allocation=Decimal("100"),
            start=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end=datetime(2026, 1, 31, tzinfo=timezone.utc),
        )

    assert result["trades"] == []
    assert result["win_rate"] == 0.0
    assert result["avg_return_per_trade"] == 0.0
    assert Decimal(result["ending_equity"]) == Decimal("100")


def test_run_backtest_uses_pre_start_history_for_initial_signal(session_factory):
    closes = [10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 14, 13]
    start_date = date(2026, 1, 1)

    with session_factory() as db:
        seed_symbol(db, "AAPL")
        _seed_bars(db, "AAPL", closes, start_date)

        result = run_backtest(
            db=db,
            strategy_type="ema_crossover",
            symbols=["AAPL"],
            timeframe="1Day",
            params_json={
                "fast_period": 2,
                "slow_period": 4,
                "order_quantity": "1",
            },
            risk_json={
                "max_position_quantity": "5",
                "max_daily_orders": 5,
                "cooldown_minutes": 0,
                "max_daily_notional": "1000",
            },
            capital_allocation=Decimal("100"),
            start=datetime(2026, 1, 6, tzinfo=timezone.utc),
            end=datetime(2026, 1, 31, tzinfo=timezone.utc),
        )

    trades = result["trades"]
    assert [trade.side for trade in trades] == ["buy", "sell"]
    assert trades[0].timestamp.date() == date(2026, 1, 6)
    assert len(result["equity_curve"]) == len(closes) - 5
