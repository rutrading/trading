"""Automated strategy endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Strategy, StrategyRun, Symbol, get_db
from app.dependencies import get_trading_account
from app.schemas import (
    StrategyListResponse,
    StrategyResponse,
    StrategyRunsPageResponse,
    StrategyRunResponse,
)
from app.tasks.strategy_executor import run_strategy_once

router = APIRouter()

ALLOWED_TIMEFRAMES = {"1Day"}
ALLOWED_TYPES = {"ema_crossover"}
ALLOWED_STATUS = {"active", "paused", "disabled"}


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
    timeframe: str = "1Day"
    params_json: dict = Field(default_factory=dict)
    status: str = "active"

    @field_validator("ticker")
    @classmethod
    def clean_ticker(cls, v: str) -> str:
        return v.strip().upper()


class UpdateStrategyRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    timeframe: str | None = None
    params_json: dict | None = None
    status: str | None = None


def _normalize_params(params: dict | None) -> dict:
    raw = dict(params or {})

    try:
        fast_period = int(raw.get("fast_period", 9))
        slow_period = int(raw.get("slow_period", 21))
        order_quantity = str(raw.get("order_quantity", "1"))
        max_position_quantity = str(raw.get("max_position_quantity", "100"))
        max_daily_orders = int(raw.get("max_daily_orders", 5))
        cooldown_minutes = int(raw.get("cooldown_minutes", 30))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid strategy params_json")

    if fast_period <= 0 or slow_period <= 0:
        raise HTTPException(
            status_code=400, detail="EMA periods must be greater than 0"
        )
    if fast_period >= slow_period:
        raise HTTPException(
            status_code=400,
            detail="fast_period must be less than slow_period",
        )
    if max_daily_orders <= 0:
        raise HTTPException(status_code=400, detail="max_daily_orders must be > 0")
    if cooldown_minutes < 0:
        raise HTTPException(
            status_code=400, detail="cooldown_minutes cannot be negative"
        )
    try:
        if Decimal(order_quantity) <= 0:
            raise HTTPException(status_code=400, detail="order_quantity must be > 0")
        if Decimal(max_position_quantity) <= 0:
            raise HTTPException(
                status_code=400,
                detail="max_position_quantity must be > 0",
            )
    except (InvalidOperation, TypeError):
        raise HTTPException(
            status_code=400,
            detail="order_quantity and max_position_quantity must be numeric",
        )

    normalized = {
        "fast_period": fast_period,
        "slow_period": slow_period,
        "order_quantity": order_quantity,
        "max_position_quantity": max_position_quantity,
        "max_daily_orders": max_daily_orders,
        "cooldown_minutes": cooldown_minutes,
    }

    state = raw.get("state")
    if isinstance(state, dict):
        normalized["state"] = state

    return normalized


def _get_strategy_or_404(db: Session, strategy_id: int) -> Strategy:
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if strategy is None:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


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

    if payload.strategy_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported strategy_type")
    if payload.timeframe not in ALLOWED_TIMEFRAMES:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")
    if payload.status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Unsupported status")

    symbol = db.query(Symbol).filter(Symbol.ticker == payload.ticker).first()
    if symbol is None:
        raise HTTPException(status_code=404, detail=f"{payload.ticker} not found")
    if symbol.asset_class != "us_equity":
        raise HTTPException(
            status_code=400,
            detail="Automated strategy v1 supports US equity symbols only",
        )

    existing = (
        db.query(Strategy)
        .filter(
            Strategy.trading_account_id == account.id,
            Strategy.strategy_type == payload.strategy_type,
            Strategy.ticker == payload.ticker,
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
        ticker=payload.ticker,
        timeframe=payload.timeframe,
        params_json=_normalize_params(payload.params_json),
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
    if payload.timeframe is not None:
        if payload.timeframe not in ALLOWED_TIMEFRAMES:
            raise HTTPException(status_code=400, detail="Unsupported timeframe")
        strategy.timeframe = payload.timeframe
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUS:
            raise HTTPException(status_code=400, detail="Unsupported status")
        strategy.status = payload.status
    if payload.params_json is not None:
        strategy.params_json = _normalize_params(payload.params_json)

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
