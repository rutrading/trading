from app.services.strategy_signals import evaluate_ema_signal_from_closes


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
