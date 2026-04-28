from datetime import date, timedelta
from types import SimpleNamespace

from app.services.strategy_signals import (
    evaluate_breakout_signal_from_bars,
    evaluate_ema_signal_from_closes,
    evaluate_rsi_signal_from_closes,
    evaluate_sma_signal_from_closes,
)


def test_ema_crossover_buy_signal():
    closes = [100] * 25 + [120]
    signal, details = evaluate_ema_signal_from_closes(
        closes, fast_period=5, slow_period=12
    )
    assert signal == "buy"
    assert "curr_fast" in details


def test_ema_crossover_sell_signal():
    closes = [200] * 25 + [170]
    signal, details = evaluate_ema_signal_from_closes(
        closes, fast_period=5, slow_period=12
    )
    assert signal == "sell"
    assert "curr_slow" in details


def test_ema_insufficient_data_returns_hold():
    signal, details = evaluate_ema_signal_from_closes(
        [1, 2, 3], fast_period=3, slow_period=8
    )
    assert signal == "hold"
    assert details["error"] == "insufficient_data"


def test_sma_crossover_buy_signal():
    closes = [100] * 60 + [90, 92, 110, 110]
    signal, details = evaluate_sma_signal_from_closes(
        closes, fast_period=5, slow_period=20
    )
    assert signal == "buy"
    assert "curr_fast" in details


def test_rsi_threshold_buy_signal():
    closes = [100] * 20 + [90, 90, 90, 94, 90]
    signal, details = evaluate_rsi_signal_from_closes(
        closes,
        rsi_period=14,
        oversold_threshold=30,
        overbought_threshold=70,
    )
    assert signal == "buy"
    assert details["curr_rsi"] <= 30


def test_breakout_signal_detects_new_high():
    start = date(2026, 1, 1)
    bars = [
        SimpleNamespace(
            date=start + timedelta(days=index),
            high=10 + index,
            low=8 + index,
            close=9 + index,
        )
        for index in range(25)
    ]
    bars[-2] = SimpleNamespace(
        date=start + timedelta(days=23),
        high=30,
        low=26,
        close=29,
    )
    bars[-1] = SimpleNamespace(
        date=start + timedelta(days=24),
        high=35,
        low=30,
        close=34,
    )

    signal, details = evaluate_breakout_signal_from_bars(
        bars,
        breakout_period=20,
        exit_period=10,
    )

    assert signal == "buy"
    assert details["curr_close"] == 34
