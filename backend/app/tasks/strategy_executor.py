"""Automated strategy background executor."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from app.config import get_config
from app.db.models import Holding, Quote, Strategy, StrategyRun, Symbol, TradingAccount
from app.db.session import get_session_factory
from app.services.order_placement import (
    OrderPlacementError,
    PlaceOrderInput,
    place_order,
)
from app.services.strategy_engine import (
    evaluate_strategy_symbol,
    normalize_symbols,
    normalized_risk_config,
    resolve_signal_order_quantity,
)

logger = logging.getLogger(__name__)

_missing_schema_logged = False

ET = ZoneInfo("America/New_York")
MARKET_OPEN = (9, 30)
MARKET_CLOSE = (16, 0)


@dataclass(frozen=True)
class GuardrailResult:
    allowed: bool
    reason: str


def _safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_decimal(value, default: str) -> Decimal:
    try:
        return Decimal(str(value))
    except (TypeError, InvalidOperation):
        return Decimal(default)


def _is_market_hours(now_et: datetime) -> bool:
    if now_et.weekday() >= 5:
        return False
    minute_of_day = now_et.hour * 60 + now_et.minute
    open_min = MARKET_OPEN[0] * 60 + MARKET_OPEN[1]
    close_min = MARKET_CLOSE[0] * 60 + MARKET_CLOSE[1]
    return open_min <= minute_of_day < close_min


def _config_enabled() -> bool:
    cfg = get_config()
    raw = str(getattr(cfg, "strategy_executor_enabled", "1")).strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _is_missing_strategy_schema_error(exc: Exception) -> bool:
    if not isinstance(exc, ProgrammingError):
        return False
    orig = getattr(exc, "orig", None)
    pgcode = getattr(orig, "pgcode", None)
    if pgcode == "42P01":
        return True
    return 'relation "strategy" does not exist' in str(
        exc
    ) or 'relation "strategy_run" does not exist' in str(exc)


def _strategy_schema_ready(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1 FROM strategy LIMIT 1"))
        db.execute(text("SELECT 1 FROM strategy_run LIMIT 1"))
        return True
    except Exception as exc:
        if _is_missing_strategy_schema_error(exc):
            return False
        raise


def _log_run(
    db: Session,
    *,
    strategy: Strategy,
    signal: str,
    action: str,
    reason: str,
    inputs: dict,
    ticker: str | None = None,
    order_id: int | None = None,
    error: str | None = None,
) -> None:
    db.add(
        StrategyRun(
            strategy_id=strategy.id,
            trading_account_id=strategy.trading_account_id,
            ticker=ticker or strategy.ticker,
            signal=signal,
            action=action,
            reason=reason,
            inputs_json=inputs,
            order_id=order_id,
            error=error,
        )
    )


def _guardrails(db: Session, strategy: Strategy, now_utc: datetime) -> GuardrailResult:
    params = strategy.params_json or {}
    risk = normalized_risk_config(strategy.risk_json or {})

    cooldown_minutes = _safe_int(
        risk.get("cooldown_minutes", params.get("cooldown_minutes")), 30
    )
    max_daily_orders = _safe_int(
        risk.get("max_daily_orders", params.get("max_daily_orders")), 5
    )
    max_daily_notional = _safe_decimal(risk.get("max_daily_notional", "10000"), "10000")

    latest_run = (
        db.query(StrategyRun)
        .filter(
            StrategyRun.strategy_id == strategy.id,
            StrategyRun.action.in_(["place_buy", "place_sell"]),
        )
        .order_by(StrategyRun.run_at.desc())
        .first()
    )
    if latest_run and cooldown_minutes > 0:
        elapsed = now_utc - latest_run.run_at
        if elapsed < timedelta(minutes=cooldown_minutes):
            return GuardrailResult(False, "cooldown_active")

    start_of_day_et = now_utc.astimezone(ET).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start_utc = start_of_day_et.astimezone(timezone.utc)
    today_count = (
        db.query(StrategyRun)
        .filter(
            StrategyRun.strategy_id == strategy.id,
            StrategyRun.run_at >= start_utc,
            StrategyRun.action.in_(["place_buy", "place_sell"]),
        )
        .count()
    )
    if today_count >= max_daily_orders:
        return GuardrailResult(False, "max_daily_orders_reached")

    today_notional = (
        db.query(StrategyRun)
        .filter(
            StrategyRun.strategy_id == strategy.id,
            StrategyRun.run_at >= start_utc,
            StrategyRun.action.in_(["place_buy", "place_sell"]),
        )
        .all()
    )
    notional_total = Decimal("0")
    for run in today_notional:
        qty = _safe_decimal((run.inputs_json or {}).get("quantity"), "0")
        price = _safe_decimal(
            getattr(getattr(run, "order", None), "average_fill_price", None)
            or (run.inputs_json or {}).get("reference_price")
            or (run.inputs_json or {}).get("price"),
            "0",
        )
        notional_total += qty * price
    if notional_total >= max_daily_notional:
        return GuardrailResult(False, "max_daily_notional_reached")

    return GuardrailResult(True, "ok")


def _already_signaled_this_bar(
    strategy: Strategy, ticker: str, signal: str, bar_date: str | None
) -> bool:
    if signal not in {"buy", "sell"} or not bar_date:
        return False
    params = strategy.params_json or {}
    state = params.get("state") if isinstance(params.get("state"), dict) else {}
    symbol_state = state.get(ticker) if isinstance(state.get(ticker), dict) else {}
    return (
        symbol_state.get("last_signal") == signal
        and symbol_state.get("last_signal_bar_date") == bar_date
    )


def _record_signal_state(
    strategy: Strategy, ticker: str, signal: str, bar_date: str | None
) -> None:
    params = dict(strategy.params_json or {})
    state = dict(params.get("state") or {})
    symbol_state = dict(state.get(ticker) or {})
    symbol_state["last_signal"] = signal
    symbol_state["last_signal_bar_date"] = bar_date
    state[ticker] = symbol_state
    params["state"] = state
    strategy.params_json = params


def _process_strategy(
    db: Session,
    strategy: Strategy,
    now_et: datetime,
    *,
    force: bool = False,
) -> None:
    now_utc = now_et.astimezone(timezone.utc)

    if not force and not _is_market_hours(now_et):
        strategy.last_run_at = now_utc
        _log_run(
            db,
            strategy=strategy,
            signal="hold",
            action="none",
            reason="outside_trading_hours",
            inputs={},
        )
        return

    guardrails = _guardrails(db, strategy, now_utc)
    if not guardrails.allowed:
        strategy.last_run_at = now_utc
        _log_run(
            db,
            strategy=strategy,
            signal="hold",
            action="none",
            reason=guardrails.reason,
            inputs={},
        )
        return

    symbols = normalize_symbols(strategy)
    processed_any = False

    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == strategy.trading_account_id)
        .with_for_update()
        .first()
    )
    if account is None:
        return

    if db.query(Symbol).filter(Symbol.ticker == strategy.ticker).first() is None:
        return

    params = strategy.params_json or {}
    risk = normalized_risk_config(strategy.risk_json or {})
    quantity_default = _safe_decimal(params.get("order_quantity"), "1")
    if quantity_default <= 0:
        return

    capital_allocation = _safe_decimal(strategy.capital_allocation, "10000")
    if symbols:
        capital_allocation = capital_allocation / len(symbols)

    for ticker in symbols:
        signal, inputs, bar_date = evaluate_strategy_symbol(strategy, db, ticker)
        processed_any = True
        if signal == "hold":
            _log_run(
                db,
                strategy=strategy,
                signal="hold",
                action="none",
                reason=inputs.get("error", "no_cross"),
                inputs={"ticker": ticker, **inputs},
                ticker=ticker,
            )
            continue

        if _already_signaled_this_bar(strategy, ticker, signal, bar_date):
            _log_run(
                db,
                strategy=strategy,
                signal=signal,
                action="none",
                reason="already_signaled_for_bar",
                inputs={"ticker": ticker, **inputs},
                ticker=ticker,
            )
            continue

        symbol = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if symbol is None:
            _log_run(
                db,
                strategy=strategy,
                signal=signal,
                action="none",
                reason="symbol_missing",
                inputs={"ticker": ticker, **inputs},
                ticker=ticker,
                error="Symbol not found",
            )
            continue

        holding = (
            db.query(Holding)
            .filter(
                Holding.trading_account_id == strategy.trading_account_id,
                Holding.ticker == ticker,
            )
            .first()
        )

        side = "buy" if signal == "buy" else "sell"
        quote = db.query(Quote).filter(Quote.ticker == ticker).first()
        reference_price = Decimal(str(quote.price)) if quote and quote.price else Decimal("0")
        current_quantity = holding.quantity if holding else Decimal("0")
        quantity, blocked_reason = resolve_signal_order_quantity(
            signal=signal,
            requested_quantity=quantity_default,
            current_quantity=current_quantity,
            price=reference_price,
            capital_allocation=capital_allocation,
            risk_json=risk,
        )

        if blocked_reason is not None:
            _log_run(
                db,
                strategy=strategy,
                signal=signal,
                action="none",
                reason=blocked_reason,
                inputs={
                    "ticker": ticker,
                    "quantity": str(quantity),
                    "reference_price": str(reference_price),
                    **inputs,
                },
                ticker=ticker,
            )
            continue

        try:
            order = place_order(
                db=db,
                account=account,
                payload=PlaceOrderInput(
                    ticker=ticker,
                    asset_class=symbol.asset_class,
                    side=side,
                    order_type="market",
                    time_in_force="day",
                    quantity=quantity,
                ),
                commit=False,
            )
        except OrderPlacementError as exc:
            strategy.last_error = exc.detail
            _log_run(
                db,
                strategy=strategy,
                signal=signal,
                action="none",
                reason="order_rejected",
                inputs={
                    "ticker": ticker,
                    "quantity": str(quantity),
                    "reference_price": str(reference_price),
                    **inputs,
                },
                ticker=ticker,
                error=exc.detail,
            )
            continue

        strategy.last_error = None
        strategy.last_signal_at = now_utc
        strategy.last_run_at = now_utc
        _record_signal_state(strategy, ticker, signal, bar_date)
        _log_run(
            db,
            strategy=strategy,
            signal=signal,
            action="place_buy" if signal == "buy" else "place_sell",
            reason=inputs.get("error", "ema_cross"),
            inputs={
                "ticker": ticker,
                "quantity": str(quantity),
                "reference_price": str(reference_price),
                **inputs,
            },
            ticker=ticker,
            order_id=order.id,
        )

    if processed_any:
        strategy.last_run_at = now_utc


def process_active_strategies_once(*, force: bool = False) -> None:
    global _missing_schema_logged
    db: Session = get_session_factory()()
    try:
        if not _strategy_schema_ready(db):
            if not _missing_schema_logged:
                logger.warning(
                    "Strategy tables not found; skipping strategy executor. Run `bun db:push` to create schema."
                )
                _missing_schema_logged = True
            return

        _missing_schema_logged = False

        now_et = datetime.now(ET)
        processed_ids: set[int] = set()
        while True:
            query = db.query(Strategy).filter(Strategy.status == "active")
            if processed_ids:
                query = query.filter(~Strategy.id.in_(processed_ids))

            strategy = (
                query.with_for_update(skip_locked=True)
                .order_by(Strategy.id.asc())
                .first()
            )
            if strategy is None:
                return

            processed_ids.add(strategy.id)
            try:
                _process_strategy(db, strategy, now_et, force=force)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Failed processing strategy %s", strategy.id)
    finally:
        db.close()


def run_strategy_once(strategy_id: int, *, force: bool = True) -> bool:
    db: Session = get_session_factory()()
    try:
        strategy = (
            db.query(Strategy)
            .filter(Strategy.id == strategy_id)
            .with_for_update(skip_locked=True)
            .first()
        )
        if strategy is None:
            return False
        now_et = datetime.now(ET)
        _process_strategy(db, strategy, now_et, force=force)
        db.commit()
        return True
    finally:
        db.close()


async def run_strategy_executor() -> None:
    poll_interval = max(5, int(getattr(get_config(), "strategy_poll_interval", 30)))
    logger.info("Strategy executor started (poll interval: %ds)", poll_interval)
    while True:
        try:
            if _config_enabled():
                process_active_strategies_once(force=False)
        except Exception:
            logger.exception("Strategy executor encountered an error")
        await asyncio.sleep(poll_interval)
