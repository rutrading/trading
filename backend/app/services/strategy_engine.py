"""Pure strategy engine shared by paper trading and backtests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from decimal import Decimal, ROUND_FLOOR

from sqlalchemy.orm import Session

from app.db.models import DailyBar, Strategy
from app.services.strategy_signals import (
    bars_required_for_signal,
    evaluate_signal_from_bars,
)


@dataclass(frozen=True)
class StrategyField:
    key: str
    label: str
    kind: str
    description: str | None = None
    min: str | None = None
    max: str | None = None
    step: str | None = None


@dataclass(frozen=True)
class StrategyTemplate:
    id: str
    name: str
    description: str
    supported_timeframes: tuple[str, ...]
    default_params_json: dict
    default_risk_json: dict
    params_schema_json: tuple[StrategyField, ...]
    risk_schema_json: tuple[StrategyField, ...]
    status: str = "ready"


COMMON_RISK_FIELDS: tuple[StrategyField, ...] = (
    StrategyField(
        key="max_position_quantity",
        label="Max Position Qty",
        kind="decimal",
        min="0.00000001",
        step="0.00000001",
    ),
    StrategyField(
        key="max_daily_orders",
        label="Max Daily Orders",
        kind="integer",
        min="1",
        step="1",
    ),
    StrategyField(
        key="cooldown_minutes",
        label="Cooldown (min)",
        kind="integer",
        min="0",
        step="1",
    ),
    StrategyField(
        key="max_daily_notional",
        label="Max Daily Notional",
        kind="decimal",
        min="0.01",
        step="0.01",
    ),
    StrategyField(
        key="risk_per_trade",
        label="Risk / Trade",
        kind="decimal",
        description="Optional ATR-based sizing cap. Set 0 to disable.",
        min="0",
        step="0.01",
    ),
    StrategyField(
        key="atr_period",
        label="ATR Period",
        kind="integer",
        min="1",
        step="1",
    ),
    StrategyField(
        key="atr_stop_multiplier",
        label="ATR Multiplier",
        kind="decimal",
        min="0.1",
        step="0.1",
    ),
    StrategyField(
        key="allow_pyramiding",
        label="Allow pyramiding",
        kind="boolean",
        description="Let the strategy add to an existing position when risk allows.",
    ),
)

COMMON_DEFAULT_RISK = {
    "max_position_quantity": "100",
    "max_daily_orders": 5,
    "cooldown_minutes": 30,
    "max_daily_notional": "10000",
    "risk_per_trade": "0",
    "atr_period": 14,
    "atr_stop_multiplier": "2",
    "allow_pyramiding": False,
}


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
        default_risk_json=COMMON_DEFAULT_RISK,
        params_schema_json=(
            StrategyField(
                key="fast_period",
                label="Fast EMA",
                kind="integer",
                min="1",
                step="1",
            ),
            StrategyField(
                key="slow_period",
                label="Slow EMA",
                kind="integer",
                min="2",
                step="1",
            ),
            StrategyField(
                key="order_quantity",
                label="Order Qty",
                kind="decimal",
                min="0.00000001",
                step="0.00000001",
            ),
        ),
        risk_schema_json=COMMON_RISK_FIELDS,
    ),
    StrategyTemplate(
        id="sma_crossover",
        name="SMA Crossover",
        description="Simple moving-average trend following for slower, easier-to-debug signals.",
        supported_timeframes=("1Day",),
        default_params_json={
            "fast_period": 20,
            "slow_period": 50,
            "order_quantity": "1",
        },
        default_risk_json=COMMON_DEFAULT_RISK,
        params_schema_json=(
            StrategyField(
                key="fast_period",
                label="Fast SMA",
                kind="integer",
                min="1",
                step="1",
            ),
            StrategyField(
                key="slow_period",
                label="Slow SMA",
                kind="integer",
                min="2",
                step="1",
            ),
            StrategyField(
                key="order_quantity",
                label="Order Qty",
                kind="decimal",
                min="0.00000001",
                step="0.00000001",
            ),
        ),
        risk_schema_json=COMMON_RISK_FIELDS,
    ),
    StrategyTemplate(
        id="rsi_reversion",
        name="RSI Mean Reversion",
        description="Buy oversold readings and exit into overbought moves on range-bound names.",
        supported_timeframes=("1Day",),
        default_params_json={
            "rsi_period": 14,
            "oversold_threshold": 30,
            "overbought_threshold": 70,
            "order_quantity": "1",
        },
        default_risk_json=COMMON_DEFAULT_RISK,
        params_schema_json=(
            StrategyField(
                key="rsi_period",
                label="RSI Period",
                kind="integer",
                min="1",
                step="1",
            ),
            StrategyField(
                key="oversold_threshold",
                label="Oversold",
                kind="integer",
                min="1",
                max="99",
                step="1",
            ),
            StrategyField(
                key="overbought_threshold",
                label="Overbought",
                kind="integer",
                min="1",
                max="99",
                step="1",
            ),
            StrategyField(
                key="order_quantity",
                label="Order Qty",
                kind="decimal",
                min="0.00000001",
                step="0.00000001",
            ),
        ),
        risk_schema_json=COMMON_RISK_FIELDS,
    ),
    StrategyTemplate(
        id="donchian_breakout",
        name="Donchian Breakout",
        description="Enter fresh highs and exit on channel breakdowns for trend capture.",
        supported_timeframes=("1Day",),
        default_params_json={
            "breakout_period": 20,
            "exit_period": 10,
            "order_quantity": "1",
        },
        default_risk_json=COMMON_DEFAULT_RISK,
        params_schema_json=(
            StrategyField(
                key="breakout_period",
                label="Breakout Lookback",
                kind="integer",
                min="1",
                step="1",
            ),
            StrategyField(
                key="exit_period",
                label="Exit Lookback",
                kind="integer",
                min="1",
                step="1",
            ),
            StrategyField(
                key="order_quantity",
                label="Order Qty",
                kind="decimal",
                min="0.00000001",
                step="0.00000001",
            ),
        ),
        risk_schema_json=COMMON_RISK_FIELDS,
    ),
)

STRATEGY_TEMPLATE_MAP = {template.id: template for template in STRATEGY_TEMPLATES}


def catalog_payload() -> list[dict]:
    return [
        {
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "supported_timeframes": list(template.supported_timeframes),
            "default_params_json": dict(template.default_params_json),
            "default_risk_json": dict(template.default_risk_json),
            "params_schema_json": [field.__dict__ for field in template.params_schema_json],
            "risk_schema_json": [field.__dict__ for field in template.risk_schema_json],
            "status": template.status,
        }
        for template in STRATEGY_TEMPLATES
    ]


def get_strategy_template(strategy_type: str) -> StrategyTemplate | None:
    return STRATEGY_TEMPLATE_MAP.get(strategy_type)


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
        "risk_per_trade": _safe_decimal(raw.get("risk_per_trade", "0"), "0"),
        "atr_period": _safe_int(raw.get("atr_period", 14), 14),
        "atr_stop_multiplier": _safe_decimal(raw.get("atr_stop_multiplier", "2"), "2"),
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


def evaluate_strategy_symbol(
    strategy: Strategy,
    db: Session,
    ticker: str,
) -> tuple[str, str, dict, str | None]:
    if strategy.strategy_type not in STRATEGY_TEMPLATE_MAP:
        return "hold", "unsupported_strategy_type", {"strategy_type": strategy.strategy_type}, None
    if strategy.timeframe != "1Day":
        return "hold", "unsupported_timeframe", {"timeframe": strategy.timeframe}, None

    params = strategy_params(strategy)
    required_bars = max(2, bars_required_for_signal(strategy.strategy_type, params))

    bars = (
        db.query(DailyBar)
        .filter(DailyBar.ticker == ticker)
        .order_by(DailyBar.date.desc())
        .limit(required_bars)
        .all()
    )
    decision = evaluate_signal_from_bars(
        strategy.strategy_type,
        list(reversed(bars)),
        params,
    )
    return decision.signal, decision.reason, decision.inputs, decision.bar_date


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
    atr_value: Decimal | None = None,
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

    atr_stop_multiplier: Decimal = risk["atr_stop_multiplier"]
    risk_per_trade: Decimal = risk["risk_per_trade"]
    if (
        atr_value is not None
        and atr_value > 0
        and atr_stop_multiplier > 0
        and risk_per_trade > 0
    ):
        atr_risk_per_share = atr_value * atr_stop_multiplier
        atr_limited_qty = _round_down_qty(risk_per_trade / atr_risk_per_share)
        quantity = min(quantity, atr_limited_qty)
    if quantity <= 0:
        return Decimal("0"), "atr_risk_too_small"
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
    if strategy_type not in STRATEGY_TEMPLATE_MAP or timeframe != "1Day":
        return {
            "equity_curve": [],
            "drawdown_curve": [],
            "trades": [],
            "win_rate": 0.0,
            "avg_return_per_trade": 0.0,
            "max_drawdown": 0.0,
            "ending_equity": str(capital_allocation),
        }

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

    history_by_symbol: dict[str, list[DailyBar]] = {symbol: [] for symbol in symbols}

    for date_value in dates:
        day_order_count = 0
        day_notional = Decimal("0")
        for symbol, rows in bars_by_symbol.items():
            row = next((r for r in rows if r.date == date_value), None)
            if row is None:
                continue
            history_by_symbol[symbol].append(row)
            decision = evaluate_signal_from_bars(
                strategy_type,
                history_by_symbol[symbol],
                params_json,
            )
            signal = decision.signal
            if signal == "hold":
                continue

            price = Decimal(str(row.close))
            if day_order_count >= risk["max_daily_orders"]:
                continue

            atr_value = _atr_from_rows(history_by_symbol[symbol], risk["atr_period"])

            if signal == "buy":
                available_qty, reason = resolve_signal_order_quantity(
                    signal=signal,
                    requested_quantity=order_quantity,
                    current_quantity=position_qty[symbol],
                    price=price,
                    capital_allocation=min(capital_allocation, cash),
                    risk_json=risk,
                    atr_value=atr_value,
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
                    atr_value=atr_value,
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


def _atr_from_rows(rows: list[DailyBar], period: int) -> Decimal:
    if period <= 0 or len(rows) < period + 1:
        return Decimal("0")
    true_ranges: list[Decimal] = []
    for previous, current in zip(rows[:-1], rows[1:]):
        prev_close = Decimal(str(previous.close))
        high = Decimal(str(current.high))
        low = Decimal(str(current.low))
        true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))
    return sum(true_ranges[-period:], Decimal("0")) / Decimal(period)
