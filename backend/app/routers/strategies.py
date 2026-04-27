"""Automated strategy endpoints."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.config import get_config
from app.auth import get_current_user
from app.db import Holding, Order, Strategy, StrategyRun, Symbol, get_db
from app.db.session import get_session_factory
from app.dependencies import get_trading_account
from app.schemas import (
    StrategyBacktestResponse,
    StrategyCatalogResponse,
    StrategyListResponse,
    StrategyResponse,
    StrategySnapshotResponse,
    StrategyRunsPageResponse,
    StrategyRunResponse,
    StrategyTemplateResponse,
)
from app.services.strategy_engine import (
    COMMON_DEFAULT_RISK,
    STRATEGY_TEMPLATES,
    catalog_payload,
    get_strategy_template,
    run_backtest,
)
from app.services.strategy_signals import bars_required_for_signal
from app.services.bars import fetch_daily_bars
from app.rate_limit import get_alpaca_limiter
from app.tasks.strategy_executor import run_strategy_once

router = APIRouter()

ALLOWED_TIMEFRAMES = {"1Day"}
ALLOWED_TYPES = {template.id for template in STRATEGY_TEMPLATES}
ALLOWED_STATUS = {"active", "paused", "disabled"}
MAX_ACTIVE_STRATEGIES_PER_ACCOUNT = 5


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


def _ensure_strategy_schema_ready(db: Session) -> None:
    try:
        db.execute(text("SELECT 1 FROM strategy LIMIT 1"))
        db.execute(text("SELECT 1 FROM strategy_run LIMIT 1"))
    except Exception as exc:
        if _is_missing_strategy_schema_error(exc):
            raise HTTPException(
                status_code=503,
                detail="Strategy tables are not initialized. Run `bun db:push` and restart the API.",
            )
        raise


class CreateStrategyRequest(BaseModel):
    trading_account_id: int
    name: str = Field(min_length=1, max_length=64)
    strategy_type: str = "ema_crossover"
    ticker: str = Field(min_length=1, max_length=16)
    symbols_json: list[str] = Field(default_factory=list)
    timeframe: str = "1Day"
    capital_allocation: str = "10000"
    params_json: dict = Field(default_factory=dict)
    risk_json: dict = Field(default_factory=dict)
    status: str = "active"

    @field_validator("ticker")
    @classmethod
    def clean_ticker(cls, v: str) -> str:
        return v.strip().upper()


class UpdateStrategyRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    ticker: str | None = None
    symbols_json: list[str] | None = None
    timeframe: str | None = None
    capital_allocation: str | None = None
    params_json: dict | None = None
    risk_json: dict | None = None
    status: str | None = None


class BacktestRequest(BaseModel):
    strategy_type: str = "ema_crossover"
    ticker: str = Field(min_length=1, max_length=16)
    symbols_json: list[str] = Field(default_factory=list)
    timeframe: str = "1Day"
    capital_allocation: str = "10000"
    params_json: dict = Field(default_factory=dict)
    risk_json: dict = Field(default_factory=dict)
    start: str
    end: str


class StrategyControlRequest(BaseModel):
    trading_account_id: int
    action: str = Field(pattern="^(pause_all|resume_all|disable_all)$")


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _normalize_params(strategy_type: str, params: dict | None) -> dict:
    template = get_strategy_template(strategy_type)
    if template is None:
        raise HTTPException(status_code=400, detail="Unsupported strategy_type")

    raw = {**template.default_params_json, **dict(params or {})}
    try:
        order_quantity = str(raw.get("order_quantity", template.default_params_json["order_quantity"]))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid strategy params_json")

    try:
        if Decimal(order_quantity) <= 0:
            raise HTTPException(status_code=400, detail="order_quantity must be > 0")
    except (InvalidOperation, TypeError):
        raise HTTPException(status_code=400, detail="order_quantity must be numeric")

    if strategy_type in {"ema_crossover", "sma_crossover"}:
        try:
            fast_period = int(raw.get("fast_period", template.default_params_json["fast_period"]))
            slow_period = int(raw.get("slow_period", template.default_params_json["slow_period"]))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid strategy params_json")

        label = "EMA" if strategy_type == "ema_crossover" else "SMA"
        if fast_period <= 0 or slow_period <= 0:
            raise HTTPException(status_code=400, detail=f"{label} periods must be greater than 0")
        if fast_period >= slow_period:
            raise HTTPException(status_code=400, detail="fast_period must be less than slow_period")
        normalized = {
            "fast_period": fast_period,
            "slow_period": slow_period,
            "order_quantity": order_quantity,
        }
    elif strategy_type == "rsi_reversion":
        try:
            rsi_period = int(raw.get("rsi_period", template.default_params_json["rsi_period"]))
            oversold_threshold = int(
                raw.get("oversold_threshold", template.default_params_json["oversold_threshold"])
            )
            overbought_threshold = int(
                raw.get("overbought_threshold", template.default_params_json["overbought_threshold"])
            )
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid strategy params_json")

        if rsi_period <= 0:
            raise HTTPException(status_code=400, detail="rsi_period must be greater than 0")
        if not 0 < oversold_threshold < overbought_threshold < 100:
            raise HTTPException(
                status_code=400,
                detail="RSI thresholds must satisfy 0 < oversold < overbought < 100",
            )
        normalized = {
            "rsi_period": rsi_period,
            "oversold_threshold": oversold_threshold,
            "overbought_threshold": overbought_threshold,
            "order_quantity": order_quantity,
        }
    else:
        try:
            breakout_period = int(
                raw.get("breakout_period", template.default_params_json["breakout_period"])
            )
            exit_period = int(raw.get("exit_period", template.default_params_json["exit_period"]))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid strategy params_json")

        if breakout_period <= 0 or exit_period <= 0:
            raise HTTPException(
                status_code=400,
                detail="breakout_period and exit_period must be greater than 0",
            )
        normalized = {
            "breakout_period": breakout_period,
            "exit_period": exit_period,
            "order_quantity": order_quantity,
        }

    state = raw.get("state")
    if isinstance(state, dict):
        normalized["state"] = state
    return normalized


def _normalize_risk(risk: dict | None) -> dict:
    raw = {**COMMON_DEFAULT_RISK, **dict(risk or {})}
    try:
        max_position_quantity = str(raw.get("max_position_quantity", COMMON_DEFAULT_RISK["max_position_quantity"]))
        max_daily_orders = int(raw.get("max_daily_orders", COMMON_DEFAULT_RISK["max_daily_orders"]))
        cooldown_minutes = int(raw.get("cooldown_minutes", COMMON_DEFAULT_RISK["cooldown_minutes"]))
        max_daily_notional = str(raw.get("max_daily_notional", COMMON_DEFAULT_RISK["max_daily_notional"]))
        risk_per_trade = str(raw.get("risk_per_trade", COMMON_DEFAULT_RISK["risk_per_trade"]))
        atr_period = int(raw.get("atr_period", COMMON_DEFAULT_RISK["atr_period"]))
        atr_stop_multiplier = str(
            raw.get("atr_stop_multiplier", COMMON_DEFAULT_RISK["atr_stop_multiplier"])
        )
        allow_pyramiding = _coerce_bool(raw.get("allow_pyramiding", False))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid risk_json")

    try:
        if Decimal(max_position_quantity) <= 0:
            raise HTTPException(status_code=400, detail="max_position_quantity must be > 0")
        if Decimal(max_daily_notional) <= 0:
            raise HTTPException(status_code=400, detail="max_daily_notional must be > 0")
        if Decimal(risk_per_trade) < 0:
            raise HTTPException(status_code=400, detail="risk_per_trade cannot be negative")
        if Decimal(atr_stop_multiplier) <= 0:
            raise HTTPException(status_code=400, detail="atr_stop_multiplier must be > 0")
    except (InvalidOperation, TypeError):
        raise HTTPException(
            status_code=400,
            detail=(
                "max_position_quantity, max_daily_notional, risk_per_trade, and "
                "atr_stop_multiplier must be numeric"
            ),
        )

    if max_daily_orders <= 0:
        raise HTTPException(status_code=400, detail="max_daily_orders must be > 0")
    if cooldown_minutes < 0:
        raise HTTPException(status_code=400, detail="cooldown_minutes cannot be negative")
    if atr_period <= 0:
        raise HTTPException(status_code=400, detail="atr_period must be > 0")

    return {
        "max_position_quantity": max_position_quantity,
        "max_daily_orders": max_daily_orders,
        "cooldown_minutes": cooldown_minutes,
        "max_daily_notional": max_daily_notional,
        "risk_per_trade": risk_per_trade,
        "atr_period": atr_period,
        "atr_stop_multiplier": atr_stop_multiplier,
        "allow_pyramiding": allow_pyramiding,
    }


def _normalize_symbols(ticker: str, symbols_json: list[str]) -> tuple[str, list[str]]:
    symbols = [ticker.strip().upper(), *[s.strip().upper() for s in symbols_json]]
    symbols = [s for i, s in enumerate(symbols) if s and s not in symbols[:i]]
    if not symbols:
        raise HTTPException(status_code=400, detail="At least one symbol is required")
    return symbols[0], symbols


def _get_strategy_or_404(db: Session, strategy_id: int) -> Strategy:
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def _active_strategy_count(query_result: object) -> int:
    return query_result if isinstance(query_result, int) else 0


def _load_symbols(db: Session, tickers: list[str]) -> list[Symbol]:
    if len(tickers) == 1:
        row = db.query(Symbol).filter(Symbol.ticker == tickers[0]).first()
        return [row] if row is not None else []
    query = db.query(Symbol).filter(Symbol.ticker.in_(tickers)).order_by(Symbol.ticker.asc())
    rows = query.all()
    if isinstance(rows, list):
        return rows
    return []


async def _fetch_and_upsert_missing_symbol(ticker: str, db: Session) -> None:
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    existing = db.query(Symbol).filter(Symbol.ticker == ticker).first()
    if existing is not None:
        return

    config = get_config()
    await get_alpaca_limiter().acquire()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{config.alpaca_base_url}/v2/assets/{ticker}",
                headers={
                    "APCA-API-KEY-ID": config.alpaca_api_key,
                    "APCA-API-SECRET-KEY": config.alpaca_secret_key,
                },
            )
            if res.status_code == 404:
                raise HTTPException(status_code=404, detail=f"{ticker} not found")
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Alpaca request failed: {exc.response.status_code}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca request failed: {exc}")

    asset = res.json()
    now = datetime.now(timezone.utc)
    db.add(
        Symbol(
            ticker=asset.get("symbol", ticker),
            name=asset.get("name", ""),
            exchange=asset.get("exchange"),
            asset_class=asset.get("class", "us_equity"),
            tradable=asset.get("tradable", True),
            fractionable=asset.get("fractionable", False),
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()


async def _ensure_backtest_symbols_and_history(
    db: Session,
    *,
    symbols: list[str],
    strategy_type: str,
    params_json: dict,
    risk_json: dict,
    start: datetime,
    end: datetime,
) -> list[Symbol]:
    symbol_rows = _load_symbols(db, symbols)
    found = {row.ticker for row in symbol_rows}
    missing = [ticker for ticker in symbols if ticker not in found]
    for ticker in missing:
        await _fetch_and_upsert_missing_symbol(ticker, db)

    symbol_rows = _load_symbols(db, symbols)
    found = {row.ticker for row in symbol_rows}
    missing = [ticker for ticker in symbols if ticker not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"{', '.join(missing)} not found")

    if any(symbol.asset_class != "us_equity" for symbol in symbol_rows):
        raise HTTPException(
            status_code=400,
            detail="Backtesting v1 supports US equity symbols only",
        )

    lookback_days = max(
        bars_required_for_signal(strategy_type, params_json),
        int(risk_json.get("atr_period", COMMON_DEFAULT_RISK["atr_period"])) + 1,
    )
    history_start = (start - timedelta(days=max(lookback_days * 3, 30))).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    end_value = end.replace(hour=23, minute=59, second=59, microsecond=0)

    for ticker in symbols:
        await fetch_daily_bars(db, ticker, history_start.isoformat(), end_value.isoformat())
    return symbol_rows


@router.get("/strategies", response_model=StrategyListResponse)
def list_strategies(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)

    strategies = (
        db.query(Strategy)
        .filter(Strategy.trading_account_id == trading_account_id)
        .order_by(Strategy.created_at.desc())
        .all()
    )
    return StrategyListResponse(
        strategies=[StrategyResponse.from_strategy(s) for s in strategies]
    )


@router.post("/strategies", response_model=StrategyResponse)
def create_strategy(
    payload: CreateStrategyRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    account = get_trading_account(
        trading_account_id=payload.trading_account_id,
        user=user,
        db=db,
    )

    if account.type != "investment":
        raise HTTPException(
            status_code=400,
            detail="Automated strategies are currently limited to investment accounts",
        )

    active_count = _active_strategy_count(
        db.query(Strategy)
        .filter(
            Strategy.trading_account_id == account.id,
            Strategy.status == "active",
        )
        .count()
    )
    if payload.status == "active" and active_count >= MAX_ACTIVE_STRATEGIES_PER_ACCOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Active strategy limit reached ({MAX_ACTIVE_STRATEGIES_PER_ACCOUNT} per account)",
        )

    if payload.strategy_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported strategy_type")
    if payload.timeframe not in ALLOWED_TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")
    if payload.status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Unsupported status")

    primary_ticker, symbols = _normalize_symbols(payload.ticker, payload.symbols_json)
    symbol_rows = _load_symbols(db, symbols)
    found = {row.ticker for row in symbol_rows}
    missing = [ticker for ticker in symbols if ticker not in found]
    if missing:
        raise HTTPException(status_code=404, detail=f"{', '.join(missing)} not found")
    if any(symbol.asset_class != "us_equity" for symbol in symbol_rows):
        raise HTTPException(
            status_code=400,
            detail="Automated strategy v1 supports US equity symbols only",
        )

    try:
        capital_allocation = Decimal(payload.capital_allocation)
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Invalid capital_allocation")
    if capital_allocation <= 0:
        raise HTTPException(status_code=400, detail="capital_allocation must be > 0")

    existing = (
        db.query(Strategy)
        .filter(
            Strategy.trading_account_id == account.id,
            Strategy.strategy_type == payload.strategy_type,
            Strategy.ticker == primary_ticker,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=400,
            detail="Strategy already exists for this account, type, and ticker",
        )

    strategy = Strategy(
        trading_account_id=account.id,
        name=payload.name,
        strategy_type=payload.strategy_type,
        ticker=primary_ticker,
        symbols_json=symbols,
        timeframe=payload.timeframe,
        capital_allocation=capital_allocation,
        params_json=_normalize_params(payload.strategy_type, payload.params_json),
        risk_json=_normalize_risk(payload.risk_json),
        status=payload.status,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return StrategyResponse.from_strategy(strategy)


@router.patch("/strategies/{strategy_id}", response_model=StrategyResponse)
def update_strategy(
    strategy_id: int,
    payload: UpdateStrategyRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    strategy = _get_strategy_or_404(db, strategy_id)
    get_trading_account(
        trading_account_id=strategy.trading_account_id,
        user=user,
        db=db,
    )

    if payload.name is not None:
        strategy.name = payload.name
    if payload.ticker is not None or payload.symbols_json is not None:
        ticker_value = payload.ticker or strategy.ticker
        primary, symbols = _normalize_symbols(
            ticker_value,
            payload.symbols_json if payload.symbols_json is not None else list(strategy.symbols_json or []),
        )
        symbol_rows = _load_symbols(db, symbols)
        found = {row.ticker for row in symbol_rows}
        missing = [ticker for ticker in symbols if ticker not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"{', '.join(missing)} not found")
        if any(symbol.asset_class != "us_equity" for symbol in symbol_rows):
            raise HTTPException(
                status_code=400,
                detail="Automated strategy v1 supports US equity symbols only",
            )
        strategy.ticker = primary
        strategy.symbols_json = symbols
    if payload.timeframe is not None:
        if payload.timeframe not in ALLOWED_TIMEFRAMES:
            raise HTTPException(status_code=400, detail="Unsupported timeframe")
        strategy.timeframe = payload.timeframe
    if payload.capital_allocation is not None:
        try:
            strategy.capital_allocation = Decimal(payload.capital_allocation)
        except InvalidOperation:
            raise HTTPException(status_code=400, detail="Invalid capital_allocation")
        if strategy.capital_allocation <= 0:
            raise HTTPException(status_code=400, detail="capital_allocation must be > 0")
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUS:
            raise HTTPException(status_code=400, detail="Unsupported status")
        if payload.status == "active":
            active_count = _active_strategy_count(
                db.query(Strategy)
                .filter(
                    Strategy.trading_account_id == strategy.trading_account_id,
                    Strategy.status == "active",
                    Strategy.id != strategy.id,
                )
                .count()
            )
            if active_count >= MAX_ACTIVE_STRATEGIES_PER_ACCOUNT:
                raise HTTPException(
                    status_code=400,
                    detail=f"Active strategy limit reached ({MAX_ACTIVE_STRATEGIES_PER_ACCOUNT} per account)",
                )
        strategy.status = payload.status
    if payload.params_json is not None:
        strategy.params_json = _normalize_params(strategy.strategy_type, payload.params_json)
    if payload.risk_json is not None:
        strategy.risk_json = _normalize_risk(payload.risk_json)

    strategy.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(strategy)
    return StrategyResponse.from_strategy(strategy)


@router.delete("/strategies/{strategy_id}")
def delete_strategy(
    strategy_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    strategy = _get_strategy_or_404(db, strategy_id)
    get_trading_account(
        trading_account_id=strategy.trading_account_id,
        user=user,
        db=db,
    )
    db.delete(strategy)
    db.commit()
    return {"deleted": True}


@router.get("/strategy-runs", response_model=StrategyRunsPageResponse)
def list_strategy_runs(
    trading_account_id: int,
    strategy_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)

    query = db.query(StrategyRun).filter(
        StrategyRun.trading_account_id == trading_account_id
    )
    if strategy_id is not None:
        query = query.filter(StrategyRun.strategy_id == strategy_id)

    total = query.count()
    runs = (
        query.order_by(StrategyRun.run_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return StrategyRunsPageResponse(
        runs=[StrategyRunResponse.from_run(run) for run in runs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/strategies/{strategy_id}/run")
def run_strategy_manually(
    strategy_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    strategy = _get_strategy_or_404(db, strategy_id)
    get_trading_account(
        trading_account_id=strategy.trading_account_id,
        user=user,
        db=db,
    )

    ok = run_strategy_once(strategy_id, force=True)
    if not ok:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"ok": True}


@router.get("/strategy-catalog", response_model=StrategyCatalogResponse)
def strategy_catalog(
    user: dict = Depends(get_current_user),
):
    _ = user
    return StrategyCatalogResponse(
        templates=[StrategyTemplateResponse(**template) for template in catalog_payload()]
    )


def _snapshot_payload(db: Session, trading_account_id: int) -> dict:
    strategies = (
        db.query(Strategy)
        .filter(Strategy.trading_account_id == trading_account_id)
        .order_by(Strategy.created_at.desc())
        .all()
    )
    runs = (
        db.query(StrategyRun)
        .filter(StrategyRun.trading_account_id == trading_account_id)
        .order_by(StrategyRun.run_at.desc())
        .limit(20)
        .all()
    )
    open_orders = (
        db.query(Order)
        .filter(
            Order.trading_account_id == trading_account_id,
            Order.status.in_(["pending", "open", "partially_filled"]),
        )
        .order_by(Order.created_at.desc())
        .limit(25)
        .all()
    )
    holdings = (
        db.query(Holding)
        .filter(Holding.trading_account_id == trading_account_id)
        .order_by(Holding.ticker.asc())
        .all()
    )
    return {
        "trading_account_id": trading_account_id,
        "strategies": [StrategyResponse.from_strategy(strategy) for strategy in strategies],
        "runs": [StrategyRunResponse.from_run(run) for run in runs],
        "open_orders": [
            {
                "id": order.id,
                "ticker": order.ticker,
                "side": order.side,
                "status": order.status,
                "order_type": order.order_type,
                "time_in_force": order.time_in_force,
                "quantity": str(order.quantity),
                "limit_price": str(order.limit_price) if order.limit_price is not None else None,
                "stop_price": str(order.stop_price) if order.stop_price is not None else None,
                "created_at": order.created_at.isoformat(),
            }
            for order in open_orders
        ],
        "open_positions": [
            {
                "id": holding.id,
                "ticker": holding.ticker,
                "quantity": str(holding.quantity),
                "reserved_quantity": str(holding.reserved_quantity),
                "average_cost": str(holding.average_cost),
            }
            for holding in holdings
        ],
        "strategy_executor_enabled": str(
            getattr(get_config(), "strategy_executor_enabled", 1)
        ).lower()
        not in {"0", "false", "off", "no"},
    }


async def _stream_strategy_snapshots(trading_account_id: int):
    session_factory = get_session_factory()
    previous_payload = ""
    while True:
        session = session_factory()
        try:
            payload = json.dumps(
                jsonable_encoder(_snapshot_payload(session, trading_account_id))
            )
        finally:
            session.close()

        if payload != previous_payload:
            yield f"event: snapshot\ndata: {payload}\n\n"
            previous_payload = payload
        else:
            yield "event: keepalive\ndata: {}\n\n"
        await asyncio.sleep(3)


@router.get("/strategy-snapshot", response_model=StrategySnapshotResponse)
def strategy_snapshot(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)
    return _snapshot_payload(db, trading_account_id)


@router.get("/strategy-stream")
async def strategy_stream(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)
    return StreamingResponse(
        _stream_strategy_snapshots(trading_account_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/strategies/backtest", response_model=StrategyBacktestResponse)
async def backtest_strategy(
    payload: BacktestRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    _ = user

    if payload.strategy_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported strategy_type")
    if payload.timeframe not in ALLOWED_TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")

    _, symbols = _normalize_symbols(payload.ticker, payload.symbols_json)
    try:
        capital_allocation = Decimal(payload.capital_allocation)
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="Invalid capital_allocation")
    if capital_allocation <= 0:
        raise HTTPException(status_code=400, detail="capital_allocation must be > 0")

    try:
        start = datetime.fromisoformat(payload.start.replace("Z", "+00:00"))
        end = datetime.fromisoformat(payload.end.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid start or end")

    normalized_params = _normalize_params(payload.strategy_type, payload.params_json)
    normalized_risk = _normalize_risk(payload.risk_json)
    await _ensure_backtest_symbols_and_history(
        db,
        symbols=symbols,
        strategy_type=payload.strategy_type,
        params_json=normalized_params,
        risk_json=normalized_risk,
        start=start,
        end=end,
    )

    result = run_backtest(
        db=db,
        strategy_type=payload.strategy_type,
        symbols=symbols,
        timeframe=payload.timeframe,
        params_json=normalized_params,
        risk_json=normalized_risk,
        capital_allocation=capital_allocation,
        start=start,
        end=end,
    )
    return StrategyBacktestResponse(
        equity_curve=[
            {
                "time": point["time"],
                "equity": str(point["equity"]),
                "drawdown": str(point["drawdown"]),
            }
            for point in result["equity_curve"]
        ],
        drawdown_curve=[
            {
                "time": point["time"],
                "equity": str(point["equity"]),
                "drawdown": str(point["drawdown"]),
            }
            for point in result["drawdown_curve"]
        ],
        trades=[
            {
                "ticker": trade.ticker,
                "side": trade.side,
                "quantity": str(trade.quantity),
                "price": str(trade.price),
                "timestamp": trade.timestamp.isoformat(),
                "profit": str(trade.profit) if trade.profit is not None else None,
            }
            for trade in result["trades"]
        ],
        win_rate=result["win_rate"],
        avg_return_per_trade=result["avg_return_per_trade"],
        max_drawdown=result["max_drawdown"],
        ending_equity=result["ending_equity"],
    )


@router.post("/strategy-controls")
def strategy_controls(
    payload: StrategyControlRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_strategy_schema_ready(db)
    get_trading_account(trading_account_id=payload.trading_account_id, user=user, db=db)

    strategies = (
        db.query(Strategy)
        .filter(Strategy.trading_account_id == payload.trading_account_id)
        .all()
    )
    next_status = {
        "pause_all": "paused",
        "resume_all": "active",
        "disable_all": "disabled",
    }[payload.action]
    for strategy in strategies:
        strategy.status = next_status
        strategy.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"updated": len(strategies), "status": next_status}
