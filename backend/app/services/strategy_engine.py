"""Pure strategy engine shared by paper trading and backtests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from decimal import Decimal, ROUND_FLOOR

from sqlalchemy.orm import Session

from app.db.models import DailyBar, Strategy
from app.services.strategy_signals import evaluate_ema_signal_from_closes


@dataclass(frozen=True)
class StrategyTemplate:
    id: str
    name: str
    description: str
    supported_timeframes: tuple[str, ...]
    default_params_json: dict
    default_risk_json: dict
    status: str = "ready"


STRATEGY_TEMPLATES: tuple[StrategyTemplate, ...] = (
    StrategyTemplate(
        id="ema_crossover",
        name="EMA Crossover",
        description="Trend-following crossover with explicit risk caps and cooldowns.",
        supported_timeframes=("1Day",),
        default_params_json={
            "fast_period": 9,
            "slow_period": 21,
            "order_quantity": "1",
        },
        default_risk_json={
            "max_position_quantity": "100",
            "max_daily_orders": 5,
            "cooldown_minutes": 30,
            "max_daily_notional": "10000",
        },
    ),
)


def catalog_payload() -> list[dict]:
    return [
        {
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "supported_timeframes": list(template.supported_timeframes),
            "default_params_json": template.default_params_json,
            "default_risk_json": template.default_risk_json,
            "status": template.status,
        }
        for template in STRATEGY_TEMPLATES
    ]


def normalize_symbols(strategy: Strategy) -> list[str]:
    symbols = [str(s).strip().upper() for s in (strategy.symbols_json or []) if str(s).strip()]
    if not symbols:
        symbols = [strategy.ticker.strip().upper()]
    seen: set[str] = set()
    unique: list[str] = []
    for symbol in symbols:
        if symbol in seen:
            continue
        seen.add(symbol)
        unique.append(symbol)
    return unique


def strategy_params(strategy: Strategy) -> dict:
    return dict(strategy.params_json or {})


def strategy_risk(strategy: Strategy) -> dict:
    return dict(strategy.risk_json or {})


def normalized_risk_config(risk_json: dict | None) -> dict:
    raw = dict(risk_json or {})
    return {
        "max_position_quantity": _safe_decimal(raw.get("max_position_quantity", "100"), "100"),
        "max_daily_orders": _safe_int(raw.get("max_daily_orders", 5), 5),
        "cooldown_minutes": _safe_int(raw.get("cooldown_minutes", 30), 30),
        "max_daily_notional": _safe_decimal(raw.get("max_daily_notional", "10000"), "10000"),
        "allow_pyramiding": bool(raw.get("allow_pyramiding", False)),
    }


def _safe_decimal(value: object, default: str) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _safe_int(value: object, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def evaluate_strategy_symbol(strategy: Strategy, db: Session, ticker: str) -> tuple[str, dict, str | None]:
    if strategy.strategy_type != "ema_crossover":
        return "hold", {"strategy_type": strategy.strategy_type}, None
    if strategy.timeframe != "1Day":
        return "hold", {"timeframe": strategy.timeframe}, None

    params = strategy_params(strategy)
    fast_period = _safe_int(params.get("fast_period"), 9)
    slow_period = _safe_int(params.get("slow_period"), 21)

    bars = (
        db.query(DailyBar)
        .filter(DailyBar.ticker == ticker)
        .order_by(DailyBar.date.desc())
        .limit(slow_period + 30)
        .all()
    )
    bars = list(reversed(bars))
    closes = [float(bar.close) for bar in bars]
    signal, details = evaluate_ema_signal_from_closes(closes, fast_period, slow_period)
    bar_date = bars[-1].date.isoformat() if bars else None
    return signal, {
        "fast_period": fast_period,
        "slow_period": slow_period,
        "bar_count": len(closes),
        **details,
    }, bar_date


def _round_down_qty(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.00000001"), rounding=ROUND_FLOOR)


def resolve_signal_order_quantity(
    *,
    signal: str,
    requested_quantity: Decimal,
    current_quantity: Decimal,
    price: Decimal,
    capital_allocation: Decimal,
    risk_json: dict | None,
) -> tuple[Decimal, str | None]:
    risk = normalized_risk_config(risk_json)
    max_position_quantity: Decimal = risk["max_position_quantity"]
    allow_pyramiding: bool = risk["allow_pyramiding"]

    if signal == "sell":
        if current_quantity <= 0:
            return Decimal("0"), "no_position_to_sell"
        return min(requested_quantity, current_quantity), None

    if current_quantity >= max_position_quantity:
        return Decimal("0"), "max_position_reached"

    if current_quantity > 0 and not allow_pyramiding:
        return Decimal("0"), "pyramiding_disabled"

    if price <= 0:
        return Decimal("0"), "invalid_reference_price"

    capital_limited_qty = _round_down_qty(capital_allocation / price)
    remaining_position_qty = max_position_quantity - current_quantity
    quantity = min(requested_quantity, remaining_position_qty, capital_limited_qty)
    if quantity <= 0:
        return Decimal("0"), "insufficient_allocation"
    return quantity, None


@dataclass(frozen=True)
class BacktestTrade:
    ticker: str
    side: str
    quantity: Decimal
    price: Decimal
    timestamp: datetime
    profit: Decimal | None = None


def run_backtest(
    *,
    db: Session,
    strategy_type: str,
    symbols: list[str],
    timeframe: str,
    params_json: dict,
    risk_json: dict,
    capital_allocation: Decimal,
    start: datetime,
    end: datetime,
) -> dict:
    if strategy_type != "ema_crossover" or timeframe != "1Day":
        return {
            "equity_curve": [],
            "drawdown_curve": [],
            "trades": [],
            "win_rate": 0.0,
            "avg_return_per_trade": 0.0,
            "max_drawdown": 0.0,
            "ending_equity": str(capital_allocation),
        }

    fast_period = _safe_int(params_json.get("fast_period"), 9)
    slow_period = _safe_int(params_json.get("slow_period"), 21)
    order_quantity = _safe_decimal(params_json.get("order_quantity", "1"), "1")
    risk = normalized_risk_config(risk_json)

    bars_by_symbol: dict[str, list[DailyBar]] = {}
    for symbol in symbols:
        rows = (
            db.query(DailyBar)
            .filter(DailyBar.ticker == symbol, DailyBar.date >= start.date(), DailyBar.date <= end.date())
            .order_by(DailyBar.date.asc())
            .all()
        )
        bars_by_symbol[symbol] = rows

    dates = sorted({row.date for rows in bars_by_symbol.values() for row in rows})
    if not dates:
        return {
            "equity_curve": [],
            "drawdown_curve": [],
            "trades": [],
            "win_rate": 0.0,
            "avg_return_per_trade": 0.0,
            "max_drawdown": 0.0,
            "ending_equity": str(capital_allocation),
        }

    cash = capital_allocation
    position_qty: dict[str, Decimal] = {symbol: Decimal("0") for symbol in symbols}
    entry_price: dict[str, Decimal | None] = {symbol: None for symbol in symbols}
    closed_trade_returns: list[Decimal] = []
    trades: list[BacktestTrade] = []
    equity_curve: list[dict] = []
    drawdown_curve: list[dict] = []
    peak_equity = capital_allocation

    history_by_symbol: dict[str, list[float]] = {symbol: [] for symbol in symbols}

    for date_value in dates:
        day_order_count = 0
        day_notional = Decimal("0")
        for symbol, rows in bars_by_symbol.items():
            row = next((r for r in rows if r.date == date_value), None)
            if row is None:
                continue
            history_by_symbol[symbol].append(float(row.close))
            signal, details = evaluate_ema_signal_from_closes(
                history_by_symbol[symbol], fast_period, slow_period
            )
            if signal == "hold":
                continue

            price = Decimal(str(row.close))
            if day_order_count >= risk["max_daily_orders"]:
                continue

            if signal == "buy":
                available_qty, reason = resolve_signal_order_quantity(
                    signal=signal,
                    requested_quantity=order_quantity,
                    current_quantity=position_qty[symbol],
                    price=price,
                    capital_allocation=min(capital_allocation, cash),
                    risk_json=risk,
                )
                if available_qty <= 0 or reason is not None:
                    continue
                notional = available_qty * price
                if day_notional + notional > risk["max_daily_notional"]:
                    continue
                cash -= notional
                day_notional += notional
                day_order_count += 1
                if entry_price[symbol] is None:
                    entry_price[symbol] = price
                else:
                    current_qty = position_qty[symbol]
                    assert current_qty > 0
                    entry_price[symbol] = (
                        (entry_price[symbol] * current_qty + price * available_qty)
                        / (current_qty + available_qty)
                    )
                position_qty[symbol] += available_qty
                trades.append(
                    BacktestTrade(
                        ticker=symbol,
                        side="buy",
                        quantity=available_qty,
                        price=price,
                        timestamp=datetime.combine(date_value, time.min, tzinfo=timezone.utc),
                    )
                )
            elif signal == "sell" and position_qty[symbol] > 0:
                qty, reason = resolve_signal_order_quantity(
                    signal=signal,
                    requested_quantity=order_quantity,
                    current_quantity=position_qty[symbol],
                    price=price,
                    capital_allocation=capital_allocation,
                    risk_json=risk,
                )
                if qty <= 0 or reason is not None:
                    continue
                avg_entry = entry_price[symbol] or price
                pnl = (price - avg_entry) * qty
                cash += qty * price
                position_qty[symbol] -= qty
                if position_qty[symbol] <= 0:
                    position_qty[symbol] = Decimal("0")
                    entry_price[symbol] = None
                closed_trade_returns.append(
                    pnl / (avg_entry * qty) if avg_entry > 0 else Decimal("0")
                )
                day_notional += qty * price
                day_order_count += 1
                trades.append(
                    BacktestTrade(
                        ticker=symbol,
                        side="sell",
                        quantity=qty,
                        price=price,
                        timestamp=datetime.combine(date_value, time.min, tzinfo=timezone.utc),
                        profit=pnl,
                    )
                )

        equity = cash
        for symbol, qty in position_qty.items():
            if qty <= 0:
                continue
            rows = bars_by_symbol[symbol]
            row = next((r for r in reversed(rows) if r.date <= date_value), None)
            if row is not None:
                equity += qty * Decimal(str(row.close))

        peak_equity = max(peak_equity, equity)
        drawdown = Decimal("0")
        if peak_equity > 0:
            drawdown = (equity - peak_equity) / peak_equity

        ts = int(datetime.combine(date_value, time.min, tzinfo=timezone.utc).timestamp())
        equity_curve.append({"time": ts, "equity": equity, "drawdown": drawdown})
        drawdown_curve.append({"time": ts, "equity": equity, "drawdown": drawdown})

    win_rate = 0.0
    avg_return = 0.0
    if closed_trade_returns:
        wins = sum(1 for value in closed_trade_returns if value > 0)
        win_rate = wins / len(closed_trade_returns)
        avg_return = float(sum(closed_trade_returns) / len(closed_trade_returns))

    return {
        "equity_curve": equity_curve,
        "drawdown_curve": drawdown_curve,
        "trades": trades,
        "win_rate": win_rate,
        "avg_return_per_trade": avg_return,
        "max_drawdown": float(min((p["drawdown"] for p in drawdown_curve), default=Decimal("0"))),
        "ending_equity": str(equity_curve[-1]["equity"] if equity_curve else capital_allocation),
    }
