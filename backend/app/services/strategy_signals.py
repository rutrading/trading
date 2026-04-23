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


def _ema_series(values: list[float], period: int) -> list[float]:
    if period <= 0:
        raise ValueError("period must be > 0")
    if not values:
        return []
    alpha = 2 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append((alpha * v) + ((1 - alpha) * out[-1]))
    return out


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

    fast = _ema_series(closes, fast_period)
    slow = _ema_series(closes, slow_period)

    prev_fast, curr_fast = fast[-2], fast[-1]
    prev_slow, curr_slow = slow[-2], slow[-1]

    if prev_fast <= prev_slow and curr_fast > curr_slow:
        return "buy", {
            "prev_fast": prev_fast,
            "prev_slow": prev_slow,
            "curr_fast": curr_fast,
            "curr_slow": curr_slow,
        }
    if prev_fast >= prev_slow and curr_fast < curr_slow:
        return "sell", {
            "prev_fast": prev_fast,
            "prev_slow": prev_slow,
            "curr_fast": curr_fast,
            "curr_slow": curr_slow,
        }
    return "hold", {
        "prev_fast": prev_fast,
        "prev_slow": prev_slow,
        "curr_fast": curr_fast,
        "curr_slow": curr_slow,
    }


def _bar_date_to_iso(raw: date | str) -> str:
    return raw.isoformat() if isinstance(raw, date) else str(raw)


def evaluate_strategy_signal(strategy: Strategy, db: Session) -> SignalDecision:
    if strategy.strategy_type != "ema_crossover":
        return SignalDecision(
            signal="hold",
            reason="unsupported_strategy_type",
            inputs={"strategy_type": strategy.strategy_type},
        )

    if strategy.timeframe != "1Day":
        return SignalDecision(
            signal="hold",
            reason="unsupported_timeframe",
            inputs={"timeframe": strategy.timeframe},
        )

    params = strategy.params_json or {}
    fast_period = int(params.get("fast_period", 9))
    slow_period = int(params.get("slow_period", 21))
    required = slow_period + 30

    bars = (
        db.query(DailyBar)
        .filter(DailyBar.ticker == strategy.ticker)
        .order_by(DailyBar.date.desc())
        .limit(required)
        .all()
    )
    bars = list(reversed(bars))
    closes = [float(b.close) for b in bars]

    signal, details = evaluate_ema_signal_from_closes(closes, fast_period, slow_period)
    reason = "ema_cross" if signal in ("buy", "sell") else "no_cross"
    if details.get("error") == "insufficient_data":
        reason = "insufficient_data"
    elif details.get("error") == "fast_not_less_than_slow":
        reason = "invalid_parameters"

    latest_bar = _bar_date_to_iso(bars[-1].date) if bars else None
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
