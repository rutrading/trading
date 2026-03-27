"""Order endpoints: place, list, get, and cancel orders."""

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Order, get_db
from app.db.models import TradingAccount
from app.dependencies import get_trading_account
from app.schemas import (
    OrderDetailResponse,
    OrderResponse,
    OrdersPageResponse,
    OrderTransactionResponse,
)
from app.services.atr import compute_atr
from app.services.trading import (
    OrderValidationError,
    compute_stop_reservation_per_share,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class PlaceOrderRequest(BaseModel):
    trading_account_id: int
    ticker: str = Field(min_length=1, max_length=16)
    asset_class: str  # "us_equity" | "crypto"
    side: str  # "buy" | "sell"
    order_type: str  # "market" | "limit" | "stop" | "stop_limit"
    time_in_force: str = "day"  # "day" | "gtc"
    quantity: str  # string to avoid float precision issues
    price: str | None = None  # execution price for market orders
    limit_price: str | None = None  # required for limit / stop_limit
    stop_price: str | None = None  # required for stop / stop_limit

    @field_validator("ticker")
    @classmethod
    def clean_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("quantity", "price", "limit_price", "stop_price")
    @classmethod
    def validate_decimal(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            Decimal(v)
        except InvalidOperation:
            raise ValueError(f"Invalid decimal value: {v}")
        return v


def _get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/orders")
def place_order(
    payload: PlaceOrderRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Place a new order (market, limit, stop, or stop-limit)."""

    # verify the user is a member of this trading account
    account = get_trading_account(
        trading_account_id=payload.trading_account_id,
        user=user,
        db=db,
    )

    quantity = Decimal(payload.quantity)
    limit_price = Decimal(payload.limit_price) if payload.limit_price else None
    stop_price = Decimal(payload.stop_price) if payload.stop_price else None

    try:
        validate_order_request(
            account=account,
            db=db,
            ticker=payload.ticker,
            asset_class=payload.asset_class,
            side=payload.side,
            order_type=payload.order_type,
            time_in_force=payload.time_in_force,
            quantity=quantity,
            limit_price=limit_price,
            stop_price=stop_price,
        )
    except OrderValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.detail)

    # create order record
    order = Order(
        trading_account_id=account.id,
        ticker=payload.ticker,
        asset_class=payload.asset_class,
        side=payload.side,
        order_type=payload.order_type,
        time_in_force=payload.time_in_force,
        quantity=quantity,
        limit_price=limit_price,
        stop_price=stop_price,
    )

    price = Decimal(payload.price) if payload.price else None

    if payload.order_type == "market" and price is None:
        raise HTTPException(
            status_code=400,
            detail="Market orders require a price (the current market price).",
        )

    # determine the price to check buying power against based on order type:
    # market → execution price, limit/stop_limit → limit_price (worst case),
    # stop → stop_price (trigger price, best available estimate)
    check_price = price or limit_price or stop_price

    # for all buy orders, check available buying power (balance minus already reserved)
    if payload.side == "buy" and check_price is not None:
        try:
            validate_buying_power(account, payload.side, quantity, check_price)
        except OrderValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.detail)

    if payload.order_type == "market":
        order.status = "pending"
        db.add(order)
        db.flush()  # get order.id before creating transactions

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=price,
            fill_quantity=quantity,
        )
        db.commit()
        db.refresh(order)

        logger.info(
            "Market order filled: %s %s %s @ %s for account %d",
            payload.side,
            quantity,
            payload.ticker,
            price,
            account.id,
        )

    else:
        # compute and store per-share reservation for open buy orders
        if payload.side == "buy":
            if payload.order_type == "stop":
                atr = compute_atr(payload.ticker, db)
                rps = compute_stop_reservation_per_share(stop_price, atr)
            elif payload.order_type in ("limit", "stop_limit"):
                rps = limit_price  # limit_price is the hard ceiling
            else:
                rps = None

            if rps is not None:
                order.reserved_per_share = rps
                account.reserved_balance += quantity * rps
                account.updated_at = datetime.now(timezone.utc)

        order.status = "open"
        db.add(order)
        db.commit()
        db.refresh(order)

        logger.info(
            "Order placed: %s %s %s (%s) for account %d, status=%s",
            payload.side,
            quantity,
            payload.ticker,
            payload.order_type,
            account.id,
            order.status,
        )

    return OrderResponse.from_order(order)


@router.get("/orders")
def list_orders(
    trading_account_id: int,
    status: str | None = Query(None),
    ticker: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List orders for a trading account with optional filters and pagination."""

    # verify membership
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)

    query = db.query(Order).filter(Order.trading_account_id == trading_account_id)

    if status:
        query = query.filter(Order.status == status)
    if ticker:
        query = query.filter(Order.ticker == ticker.upper().strip())

    total = query.count()
    orders = (
        query.order_by(Order.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return OrdersPageResponse(
        orders=[OrderResponse.from_order(order) for order in orders],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single order with its transaction history."""

    order = _get_order_or_404(db, order_id)

    # verify the user owns this order's account
    get_trading_account(trading_account_id=order.trading_account_id, user=user, db=db)

    base = OrderResponse.from_order(order)
    return OrderDetailResponse(
        **base.model_dump(),
        transactions=[
            OrderTransactionResponse.from_transaction(transaction)
            for transaction in order.transactions
        ],
    )


@router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel an open or partially-filled order."""

    order = _get_order_or_404(db, order_id)

    # verify the user owns this order's account
    get_trading_account(trading_account_id=order.trading_account_id, user=user, db=db)

    # only open or partially filled orders can be cancelled
    if order.status not in ("open", "partially_filled"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status '{order.status}'",
        )

    # release reserved balance for open buy orders
    if order.side == "buy" and order.reserved_per_share is not None:
        remaining = order.quantity - (order.filled_quantity or Decimal("0"))
        account = db.query(TradingAccount).filter(TradingAccount.id == order.trading_account_id).first()
        if account is not None:
            account.reserved_balance = max(
                Decimal("0"),
                account.reserved_balance - remaining * order.reserved_per_share,
            )
            account.updated_at = datetime.now(timezone.utc)

    order.status = "cancelled"
    db.commit()
    db.refresh(order)

    logger.info("Order %d cancelled for account %d", order.id, order.trading_account_id)

    return OrderResponse.from_order(order)
