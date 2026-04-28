"""Kalshi bot endpoints — account-scoped to the current user's single Kalshi
account. No ``account_id`` path params: the router resolves
``kalshi_account.user_id`` from the bearer token, so every handler operates on
the caller's own account by construction.

The REST client (``app.services.kalshi_rest``) is imported *inside* the
provisioning handler, not at module top, so the unconditional router import in
``app.main`` does not pull the bot's HTTP surface into ``sys.modules`` when
``KALSHI_BOT_ENABLED=false``. See ``test_kalshi_lifespan.py``.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import (
    KalshiAccount,
    KalshiBotState,
    KalshiFill,
    KalshiOrder,
    KalshiPosition,
    KalshiSignal,
    get_db,
)
from app.strategies.kalshi import list_strategies

router = APIRouter()


def _decimal_str(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def get_user_kalshi_account(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> KalshiAccount:
    """Resolve the caller's Kalshi account or 404.

    SKIP_AUTH dev mode (``sub == 'dev'``) returns the first Kalshi account in
    the DB so manual curl smoke tests work without a real bearer token.
    """
    user_id = str(user.get("sub", "")).strip()
    if user_id == "dev":
        acc = db.query(KalshiAccount).first()
    else:
        acc = (
            db.query(KalshiAccount)
            .filter(KalshiAccount.user_id == user_id)
            .first()
        )
    if acc is None:
        raise HTTPException(
            status_code=404, detail="No Kalshi account for this user"
        )
    return acc


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class KalshiAccountInfo(BaseModel):
    trading_account_id: int
    subaccount_number: int | None
    status: str
    provisioning_error: str | None
    last_balance_dollars: str | None


class KalshiBotStateInfo(BaseModel):
    active_strategy: str
    automation_enabled: bool
    paused: bool
    dry_run: bool
    max_orders_per_cycle: int
    max_open_contracts: int
    last_cycle_at: datetime | None
    last_error: str | None


class KalshiStatusResponse(BaseModel):
    account: KalshiAccountInfo
    bot_state: KalshiBotStateInfo


class KalshiSignalRow(BaseModel):
    id: int
    market_ticker: str | None
    strategy: str
    side: str | None
    action: str | None
    count_fp: str | None
    limit_price_dollars: str | None
    decision: str
    reason: str | None
    snapshot: dict | None
    created_at: datetime


class KalshiOrderRow(BaseModel):
    id: int
    market_ticker: str
    side: str
    action: str
    count_fp: str
    limit_price_dollars: str | None
    status: str
    fill_count_fp: str
    remaining_count_fp: str | None
    rejection_reason: str | None
    subaccount_number: int | None
    kalshi_order_id: str | None
    created_at: datetime
    updated_at: datetime


class KalshiPositionRow(BaseModel):
    market_ticker: str
    position_fp: str
    total_traded_dollars: str
    market_exposure_dollars: str
    realized_pnl_dollars: str
    fees_paid_dollars: str
    updated_at: datetime


class KalshiFillRow(BaseModel):
    id: int
    market_ticker: str
    side: str
    action: str
    count_fp: str
    yes_price_dollars: str | None
    no_price_dollars: str | None
    fee_dollars: str
    is_taker: bool | None
    kalshi_order_id: str | None
    executed_at: datetime


class StrategyUpdateRequest(BaseModel):
    strategy: str


class ControlRequest(BaseModel):
    automation_enabled: bool | None = None
    paused: bool | None = None
    dry_run: bool | None = None


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------


def _account_to_response(account: KalshiAccount) -> KalshiAccountInfo:
    return KalshiAccountInfo(
        trading_account_id=account.trading_account_id,
        subaccount_number=account.subaccount_number,
        status=account.status,
        provisioning_error=account.provisioning_error,
        last_balance_dollars=_decimal_str(account.last_balance_dollars),
    )


def _state_to_response(state: KalshiBotState) -> KalshiBotStateInfo:
    return KalshiBotStateInfo(
        active_strategy=state.active_strategy,
        automation_enabled=state.automation_enabled,
        paused=state.paused,
        dry_run=state.dry_run,
        max_orders_per_cycle=state.max_orders_per_cycle,
        max_open_contracts=state.max_open_contracts,
        last_cycle_at=state.last_cycle_at,
        last_error=state.last_error,
    )


def _signal_to_response(row: KalshiSignal) -> KalshiSignalRow:
    return KalshiSignalRow(
        id=row.id,
        market_ticker=row.market_ticker,
        strategy=row.strategy,
        side=row.side,
        action=row.action,
        count_fp=_decimal_str(row.count_fp),
        limit_price_dollars=_decimal_str(row.limit_price_dollars),
        decision=row.decision,
        reason=row.reason,
        snapshot=row.snapshot,
        created_at=row.created_at,
    )


def _order_to_response(row: KalshiOrder) -> KalshiOrderRow:
    return KalshiOrderRow(
        id=row.id,
        market_ticker=row.market_ticker,
        side=row.side,
        action=row.action,
        count_fp=_decimal_str(row.count_fp) or "0",
        limit_price_dollars=_decimal_str(row.limit_price_dollars),
        status=row.status,
        fill_count_fp=_decimal_str(row.fill_count_fp) or "0",
        remaining_count_fp=_decimal_str(row.remaining_count_fp),
        rejection_reason=row.rejection_reason,
        subaccount_number=row.subaccount_number,
        kalshi_order_id=row.kalshi_order_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _position_to_response(row: KalshiPosition) -> KalshiPositionRow:
    return KalshiPositionRow(
        market_ticker=row.market_ticker,
        position_fp=_decimal_str(row.position_fp) or "0",
        total_traded_dollars=_decimal_str(row.total_traded_dollars) or "0",
        market_exposure_dollars=_decimal_str(row.market_exposure_dollars) or "0",
        realized_pnl_dollars=_decimal_str(row.realized_pnl_dollars) or "0",
        fees_paid_dollars=_decimal_str(row.fees_paid_dollars) or "0",
        updated_at=row.updated_at,
    )


def _fill_to_response(row: KalshiFill) -> KalshiFillRow:
    return KalshiFillRow(
        id=row.id,
        market_ticker=row.market_ticker,
        side=row.side,
        action=row.action,
        count_fp=_decimal_str(row.count_fp) or "0",
        yes_price_dollars=_decimal_str(row.yes_price_dollars),
        no_price_dollars=_decimal_str(row.no_price_dollars),
        fee_dollars=_decimal_str(row.fee_dollars) or "0",
        is_taker=row.is_taker,
        kalshi_order_id=row.kalshi_order_id,
        executed_at=row.executed_at,
    )


def _load_state_or_404(
    db: Session, trading_account_id: int
) -> KalshiBotState:
    state = (
        db.query(KalshiBotState)
        .filter(KalshiBotState.trading_account_id == trading_account_id)
        .first()
    )
    if state is None:
        # Created alongside the kalshi_account row in branch 08; absence here
        # is a data-integrity bug, not a user-visible state.
        raise HTTPException(status_code=404, detail="Bot state missing")
    return state


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/kalshi/status", response_model=KalshiStatusResponse)
def get_status(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
) -> KalshiStatusResponse:
    state = _load_state_or_404(db, account.trading_account_id)
    return KalshiStatusResponse(
        account=_account_to_response(account),
        bot_state=_state_to_response(state),
    )


@router.post(
    "/kalshi/provision-subaccount", response_model=KalshiAccountInfo
)
async def provision_subaccount(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
) -> KalshiAccountInfo:
    if account.status == "active" and account.subaccount_number is not None:
        return _account_to_response(account)

    # Local import keeps app.services.kalshi_rest out of sys.modules when the
    # bot is disabled — see test_kalshi_lifespan.
    from app.services import kalshi_rest

    try:
        result = await kalshi_rest.create_subaccount()
    except Exception as exc:
        account.status = "failed"
        account.provisioning_error = str(exc)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Subaccount provisioning failed: {exc}",
        )

    account.subaccount_number = int(result["subaccount_number"])
    account.status = "active"
    account.provisioning_error = None
    db.commit()
    db.refresh(account)
    return _account_to_response(account)


@router.get("/kalshi/signals", response_model=list[KalshiSignalRow])
def get_signals(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=200),
) -> list[KalshiSignalRow]:
    rows = (
        db.query(KalshiSignal)
        .filter(KalshiSignal.trading_account_id == account.trading_account_id)
        .order_by(KalshiSignal.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_signal_to_response(r) for r in rows]


@router.get("/kalshi/orders", response_model=list[KalshiOrderRow])
def get_orders(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=200),
) -> list[KalshiOrderRow]:
    rows = (
        db.query(KalshiOrder)
        .filter(KalshiOrder.trading_account_id == account.trading_account_id)
        .order_by(KalshiOrder.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_order_to_response(r) for r in rows]


@router.get("/kalshi/positions", response_model=list[KalshiPositionRow])
def get_positions(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
) -> list[KalshiPositionRow]:
    rows = (
        db.query(KalshiPosition)
        .filter(
            KalshiPosition.trading_account_id == account.trading_account_id
        )
        .order_by(KalshiPosition.updated_at.desc())
        .all()
    )
    return [_position_to_response(r) for r in rows]


@router.get("/kalshi/fills", response_model=list[KalshiFillRow])
def get_fills(
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=200),
) -> list[KalshiFillRow]:
    rows = (
        db.query(KalshiFill)
        .filter(KalshiFill.trading_account_id == account.trading_account_id)
        .order_by(KalshiFill.executed_at.desc())
        .limit(limit)
        .all()
    )
    return [_fill_to_response(r) for r in rows]


@router.post("/kalshi/strategy", response_model=KalshiBotStateInfo)
def update_strategy(
    body: StrategyUpdateRequest,
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
) -> KalshiBotStateInfo:
    if body.strategy not in list_strategies():
        raise HTTPException(
            status_code=400, detail=f"Unknown strategy: {body.strategy}"
        )
    state = _load_state_or_404(db, account.trading_account_id)
    state.active_strategy = body.strategy
    db.commit()
    db.refresh(state)
    return _state_to_response(state)


@router.post("/kalshi/control", response_model=KalshiBotStateInfo)
def update_control(
    body: ControlRequest,
    account: KalshiAccount = Depends(get_user_kalshi_account),
    db: Session = Depends(get_db),
) -> KalshiBotStateInfo:
    state = _load_state_or_404(db, account.trading_account_id)

    # Mirror the bot's runtime gate (branch 05 §F1): non-dry-run automation
    # requires a provisioned subaccount. Fail at the API rather than silently
    # block at runtime.
    next_dry_run = body.dry_run if body.dry_run is not None else state.dry_run
    next_automation = (
        body.automation_enabled
        if body.automation_enabled is not None
        else state.automation_enabled
    )
    if (
        not next_dry_run
        and next_automation
        and account.subaccount_number is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Provision a Kalshi subaccount before enabling non-dry-run automation.",
        )

    if body.automation_enabled is not None:
        state.automation_enabled = body.automation_enabled
    if body.paused is not None:
        state.paused = body.paused
    if body.dry_run is not None:
        state.dry_run = body.dry_run
    db.commit()
    db.refresh(state)
    return _state_to_response(state)
