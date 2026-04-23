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
from app.db.models import Holding, Strategy, StrategyRun, Symbol, TradingAccount
from app.db.session import get_session_factory
from app.services.order_placement import (
    OrderPlacementError,
    PlaceOrderInput,
    place_order,
)
from app.services.strategy_signals import SignalDecision, evaluate_strategy_signal

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
    order_id: int | None = None,
    error: str | None = None,
) -> None:
    db.add(
        StrategyRun(
            strategy_id=strategy.id,
            trading_account_id=strategy.trading_account_id,
            ticker=strategy.ticker,
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

    cooldown_minutes = _safe_int(params.get("cooldown_minutes"), 30)
    max_daily_orders = _safe_int(params.get("max_daily_orders"), 5)
    max_position_quantity = _safe_decimal(params.get("max_position_quantity"), "100")

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

    holding = (
        db.query(Holding)
        .filter(
            Holding.trading_account_id == strategy.trading_account_id,
            Holding.ticker == strategy.ticker,
        )
        .first()
    )
    current_qty = holding.quantity if holding else Decimal("0")
    if current_qty >= max_position_quantity:
        return GuardrailResult(False, "max_position_reached")

    return GuardrailResult(True, "ok")


def _already_signaled_this_bar(
    strategy: Strategy, signal: str, bar_date: str | None
) -> bool:
    if signal not in {"buy", "sell"} or not bar_date:
        return False
    params = strategy.params_json or {}
    state = params.get("state") if isinstance(params.get("state"), dict) else {}
    return (
        state.get("last_signal") == signal
        and state.get("last_signal_bar_date") == bar_date
    )


def _record_signal_state(strategy: Strategy, signal: str, bar_date: str | None) -> None:
    params = dict(strategy.params_json or {})
    state = dict(params.get("state") or {})
    state["last_signal"] = signal
    state["last_signal_bar_date"] = bar_date
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

    decision: SignalDecision = evaluate_strategy_signal(strategy, db)
    strategy.last_run_at = now_utc

    if decision.signal == "hold":
        _log_run(
            db,
            strategy=strategy,
            signal="hold",
            action="none",
            reason=decision.reason,
            inputs=decision.inputs,
        )
        return

    if _already_signaled_this_bar(strategy, decision.signal, decision.bar_date):
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="already_signaled_for_bar",
            inputs=decision.inputs,
        )
        return

    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == strategy.trading_account_id)
        .with_for_update()
        .first()
    )
    if account is None:
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="account_missing",
            inputs=decision.inputs,
            error="Trading account not found",
        )
        return

    symbol = db.query(Symbol).filter(Symbol.ticker == strategy.ticker).first()
    if symbol is None:
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="symbol_missing",
            inputs=decision.inputs,
            error="Symbol not found",
        )
        return

    quantity = _safe_decimal((strategy.params_json or {}).get("order_quantity"), "1")
    if quantity <= 0:
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="invalid_order_quantity",
            inputs=decision.inputs,
            error="order_quantity must be > 0",
        )
        return

    holding = (
        db.query(Holding)
        .filter(
            Holding.trading_account_id == strategy.trading_account_id,
            Holding.ticker == strategy.ticker,
        )
        .first()
    )
    if decision.signal == "sell" and (holding is None or holding.quantity <= 0):
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="no_position_to_sell",
            inputs=decision.inputs,
        )
        _record_signal_state(strategy, decision.signal, decision.bar_date)
        strategy.last_signal_at = now_utc
        return

    side = "buy" if decision.signal == "buy" else "sell"
    if side == "sell" and holding is not None:
        quantity = min(quantity, holding.quantity)

    try:
        order = place_order(
            db=db,
            account=account,
            payload=PlaceOrderInput(
                ticker=strategy.ticker,
                asset_class=symbol.asset_class,
                side=side,
                order_type="market",
                time_in_force="day",
                quantity=quantity,
            ),
        )
    except OrderPlacementError as exc:
        strategy.last_error = exc.detail
        _log_run(
            db,
            strategy=strategy,
            signal=decision.signal,
            action="none",
            reason="order_rejected",
            inputs=decision.inputs,
            error=exc.detail,
        )
        return

    strategy.last_error = None
    strategy.last_signal_at = now_utc
    _record_signal_state(strategy, decision.signal, decision.bar_date)
    _log_run(
        db,
        strategy=strategy,
        signal=decision.signal,
        action="place_buy" if decision.signal == "buy" else "place_sell",
        reason=decision.reason,
        inputs=decision.inputs,
        order_id=order.id,
    )


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
        strategies = (
            db.query(Strategy)
            .filter(Strategy.status == "active")
            .order_by(Strategy.id.asc())
            .all()
        )
        if not strategies:
            return

        for strategy in strategies:
            try:
                locked = (
                    db.query(Strategy)
                    .filter(Strategy.id == strategy.id)
                    .with_for_update()
                    .first()
                )
                if locked is None or locked.status != "active":
                    continue
                _process_strategy(db, locked, now_et, force=force)
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
            .with_for_update()
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
