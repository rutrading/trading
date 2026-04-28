"""Signal evaluation for automated strategies."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.db.models import DailyBar, Strategy


@dataclass(frozen=True)
class SignalDecision:
    signal: str
    reason: str
    inputs: dict
    bar_date: str | None = None


def _safe_int(value: object, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _ema_series(values: list[float], period: int) -> list[float]:
    if period <= 0:
        raise ValueError("period must be > 0")
    if not values:
        return []
    alpha = 2 / (period + 1)
    out = [values[0]]
    for value in values[1:]:
        out.append((alpha * value) + ((1 - alpha) * out[-1]))
    return out


def _sma_series(values: list[float], period: int) -> list[float]:
    if period <= 0:
        raise ValueError("period must be > 0")
    if len(values) < period:
        return []
    out: list[float] = []
    for index in range(period - 1, len(values)):
        window = values[index - period + 1 : index + 1]
        out.append(sum(window) / period)
    return out


def _cross_signal(
    fast_values: list[float],
    slow_values: list[float],
) -> tuple[str, dict]:
    if len(fast_values) < 2 or len(slow_values) < 2:
        return "hold", {"error": "insufficient_data"}

    prev_fast, curr_fast = fast_values[-2], fast_values[-1]
    prev_slow, curr_slow = slow_values[-2], slow_values[-1]

    details = {
        "prev_fast": prev_fast,
        "prev_slow": prev_slow,
        "curr_fast": curr_fast,
        "curr_slow": curr_slow,
    }
    if prev_fast <= prev_slow and curr_fast > curr_slow:
        return "buy", details
    if prev_fast >= prev_slow and curr_fast < curr_slow:
        return "sell", details
    return "hold", details


def evaluate_ema_signal_from_closes(
    closes: list[float],
    fast_period: int,
    slow_period: int,
) -> tuple[str, dict]:
    if fast_period <= 0 or slow_period <= 0:
        return "hold", {"error": "invalid_period"}
    if fast_period >= slow_period:
        return "hold", {"error": "fast_not_less_than_slow"}
    if len(closes) < slow_period + 2:
        return "hold", {"error": "insufficient_data", "bars": len(closes)}
    return _cross_signal(
        _ema_series(closes, fast_period),
        _ema_series(closes, slow_period),
    )


def evaluate_sma_signal_from_closes(
    closes: list[float],
    fast_period: int,
    slow_period: int,
) -> tuple[str, dict]:
    if fast_period <= 0 or slow_period <= 0:
        return "hold", {"error": "invalid_period"}
    if fast_period >= slow_period:
        return "hold", {"error": "fast_not_less_than_slow"}
    if len(closes) < slow_period + 2:
        return "hold", {"error": "insufficient_data", "bars": len(closes)}

    fast = _sma_series(closes, fast_period)
    slow = _sma_series(closes, slow_period)
    # Align the shorter series so the latest two samples refer to the same bars.
    fast = fast[-len(slow) :]
    return _cross_signal(fast, slow)


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0 and avg_gain == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0
    if avg_gain == 0:
        return 0.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _rsi_series(values: list[float], period: int) -> list[float]:
    if period <= 0:
        raise ValueError("period must be > 0")
    if len(values) < period + 1:
        return []

    deltas = [curr - prev for prev, curr in zip(values[:-1], values[1:])]
    gains = [max(delta, 0.0) for delta in deltas]
    losses = [max(-delta, 0.0) for delta in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    out = [_rsi_value(avg_gain, avg_loss)]
    for index in range(period, len(gains)):
        avg_gain = ((avg_gain * (period - 1)) + gains[index]) / period
        avg_loss = ((avg_loss * (period - 1)) + losses[index]) / period
        out.append(_rsi_value(avg_gain, avg_loss))
    return out


def evaluate_rsi_signal_from_closes(
    closes: list[float],
    rsi_period: int,
    oversold_threshold: float,
    overbought_threshold: float,
) -> tuple[str, dict]:
    if rsi_period <= 0:
        return "hold", {"error": "invalid_period"}
    if not 0 < oversold_threshold < overbought_threshold < 100:
        return "hold", {"error": "invalid_thresholds"}
    if len(closes) < rsi_period + 2:
        return "hold", {"error": "insufficient_data", "bars": len(closes)}

    rsi_values = _rsi_series(closes, rsi_period)
    if len(rsi_values) < 2:
        return "hold", {"error": "insufficient_data", "bars": len(closes)}

    prev_rsi, curr_rsi = rsi_values[-2], rsi_values[-1]
    details = {
        "prev_rsi": prev_rsi,
        "curr_rsi": curr_rsi,
        "oversold_threshold": oversold_threshold,
        "overbought_threshold": overbought_threshold,
    }
    if prev_rsi > oversold_threshold and curr_rsi <= oversold_threshold:
        return "buy", details
    if prev_rsi < overbought_threshold and curr_rsi >= overbought_threshold:
        return "sell", details
    return "hold", details


def evaluate_breakout_signal_from_bars(
    bars: list[DailyBar],
    breakout_period: int,
    exit_period: int,
) -> tuple[str, dict]:
    if breakout_period <= 0 or exit_period <= 0:
        return "hold", {"error": "invalid_period"}
    required = max(breakout_period, exit_period) + 2
    if len(bars) < required:
        return "hold", {"error": "insufficient_data", "bars": len(bars)}

    closes = [float(bar.close) for bar in bars]
    highs = [float(bar.high) for bar in bars]
    lows = [float(bar.low) for bar in bars]

    prev_close, curr_close = closes[-2], closes[-1]
    prev_breakout_high = max(highs[-breakout_period - 2 : -2])
    curr_breakout_high = max(highs[-breakout_period - 1 : -1])
    prev_exit_low = min(lows[-exit_period - 2 : -2])
    curr_exit_low = min(lows[-exit_period - 1 : -1])

    details = {
        "prev_close": prev_close,
        "curr_close": curr_close,
        "prev_breakout_high": prev_breakout_high,
        "curr_breakout_high": curr_breakout_high,
        "prev_exit_low": prev_exit_low,
        "curr_exit_low": curr_exit_low,
    }
    if prev_close <= prev_breakout_high and curr_close > curr_breakout_high:
        return "buy", details
    if prev_close >= prev_exit_low and curr_close < curr_exit_low:
        return "sell", details
    return "hold", details


def _bar_date_to_iso(raw: date | str) -> str:
    return raw.isoformat() if isinstance(raw, date) else str(raw)


def bars_required_for_signal(strategy_type: str, params: dict | None) -> int:
    params = params or {}
    if strategy_type in {"ema_crossover", "sma_crossover"}:
        return _safe_int(params.get("slow_period", 21), 21) + 30
    if strategy_type == "rsi_reversion":
        return _safe_int(params.get("rsi_period", 14), 14) + 30
    if strategy_type == "donchian_breakout":
        breakout_period = _safe_int(params.get("breakout_period", 20), 20)
        exit_period = _safe_int(params.get("exit_period", 10), 10)
        return max(breakout_period, exit_period) + 2
    return 0


def evaluate_signal_from_bars(
    strategy_type: str,
    bars: list[DailyBar],
    params: dict | None,
) -> SignalDecision:
    params = dict(params or {})
    latest_bar = _bar_date_to_iso(bars[-1].date) if bars else None

    if strategy_type == "ema_crossover":
        closes = [float(bar.close) for bar in bars]
        fast_period = _safe_int(params.get("fast_period", 9), 9)
        slow_period = _safe_int(params.get("slow_period", 21), 21)
        signal, details = evaluate_ema_signal_from_closes(closes, fast_period, slow_period)
        reason = "ema_cross" if signal in {"buy", "sell"} else "no_cross"
        if details.get("error") in {"fast_not_less_than_slow", "invalid_period"}:
            reason = "invalid_parameters"
        elif details.get("error") == "insufficient_data":
            reason = "insufficient_data"
        return SignalDecision(
            signal=signal,
            reason=reason,
            inputs={
                "fast_period": fast_period,
                "slow_period": slow_period,
                "bar_count": len(closes),
                **details,
            },
            bar_date=latest_bar,
        )

    if strategy_type == "sma_crossover":
        closes = [float(bar.close) for bar in bars]
        fast_period = _safe_int(params.get("fast_period", 20), 20)
        slow_period = _safe_int(params.get("slow_period", 50), 50)
        signal, details = evaluate_sma_signal_from_closes(closes, fast_period, slow_period)
        reason = "sma_cross" if signal in {"buy", "sell"} else "no_cross"
        if details.get("error") in {"fast_not_less_than_slow", "invalid_period"}:
            reason = "invalid_parameters"
        elif details.get("error") == "insufficient_data":
            reason = "insufficient_data"
        return SignalDecision(
            signal=signal,
            reason=reason,
            inputs={
                "fast_period": fast_period,
                "slow_period": slow_period,
                "bar_count": len(closes),
                **details,
            },
            bar_date=latest_bar,
        )

    if strategy_type == "rsi_reversion":
        closes = [float(bar.close) for bar in bars]
        rsi_period = _safe_int(params.get("rsi_period", 14), 14)
        oversold_threshold = _safe_float(params.get("oversold_threshold", 30), 30.0)
        overbought_threshold = _safe_float(params.get("overbought_threshold", 70), 70.0)
        signal, details = evaluate_rsi_signal_from_closes(
            closes,
            rsi_period,
            oversold_threshold,
            overbought_threshold,
        )
        reason = "rsi_threshold" if signal in {"buy", "sell"} else "no_threshold_cross"
        if details.get("error") in {"invalid_period", "invalid_thresholds"}:
            reason = "invalid_parameters"
        elif details.get("error") == "insufficient_data":
            reason = "insufficient_data"
        return SignalDecision(
            signal=signal,
            reason=reason,
            inputs={
                "rsi_period": rsi_period,
                "oversold_threshold": oversold_threshold,
                "overbought_threshold": overbought_threshold,
                "bar_count": len(closes),
                **details,
            },
            bar_date=latest_bar,
        )

    if strategy_type == "donchian_breakout":
        breakout_period = _safe_int(params.get("breakout_period", 20), 20)
        exit_period = _safe_int(params.get("exit_period", 10), 10)
        signal, details = evaluate_breakout_signal_from_bars(
            bars,
            breakout_period,
            exit_period,
        )
        reason = "donchian_breakout" if signal in {"buy", "sell"} else "no_breakout"
        if details.get("error") == "invalid_period":
            reason = "invalid_parameters"
        elif details.get("error") == "insufficient_data":
            reason = "insufficient_data"
        return SignalDecision(
            signal=signal,
            reason=reason,
            inputs={
                "breakout_period": breakout_period,
                "exit_period": exit_period,
                "bar_count": len(bars),
                **details,
            },
            bar_date=latest_bar,
        )

    return SignalDecision(
        signal="hold",
        reason="unsupported_strategy_type",
        inputs={"strategy_type": strategy_type},
        bar_date=latest_bar,
    )


def evaluate_strategy_signal(strategy: Strategy, db: Session) -> SignalDecision:
    if strategy.timeframe != "1Day":
        return SignalDecision(
            signal="hold",
            reason="unsupported_timeframe",
            inputs={"timeframe": strategy.timeframe},
        )

    params = strategy.params_json or {}
    required = bars_required_for_signal(strategy.strategy_type, params)
    bars = (
        db.query(DailyBar)
        .filter(DailyBar.ticker == strategy.ticker)
        .order_by(DailyBar.date.desc())
        .limit(required)
        .all()
    )
    return evaluate_signal_from_bars(
        strategy.strategy_type,
        list(reversed(bars)),
        params,
    )
