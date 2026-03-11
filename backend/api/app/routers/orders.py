"""Order endpoints: place, list, get, and cancel orders."""

import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Order, get_db
from app.dependencies import get_trading_account
from app.services.trading import (
    OrderValidationError,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class PlaceOrderRequest(BaseModel):
    trading_account_id: int
    symbol: str = Field(min_length=1, max_length=16)
    asset_type: str  # "stock" | "etf" | "crypto"
    side: str  # "buy" | "sell"
    order_type: str  # "market" | "limit" | "stop" | "stop_limit"
    time_in_force: str = "day"  # "day" | "gtc"
    quantity: str  # string to avoid float precision issues
    price: str | None = None  # execution price for market orders
    limit_price: str | None = None  # required for limit / stop_limit
    stop_price: str | None = None  # required for stop / stop_limit

    @field_validator("symbol")
    @classmethod
    def clean_symbol(cls, v: str) -> str:
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


def _order_to_dict(order: Order) -> dict:
    return {
        "id": order.id,
        "trading_account_id": order.trading_account_id,
        "symbol": order.symbol,
        "asset_type": order.asset_type,
        "side": order.side,
        "order_type": order.order_type,
        "time_in_force": order.time_in_force,
        "quantity": str(order.quantity),
        "limit_price": str(order.limit_price)
        if order.limit_price is not None
        else None,
        "stop_price": str(order.stop_price) if order.stop_price is not None else None,
        "filled_quantity": str(order.filled_quantity),
        "average_fill_price": str(order.average_fill_price)
        if order.average_fill_price is not None
        else None,
        "status": order.status,
        "rejection_reason": order.rejection_reason,
        "created_at": order.created_at.isoformat(),
        "updated_at": order.updated_at.isoformat(),
    }


@router.post("/orders")
def place_order(
    payload: PlaceOrderRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Place a new order (market, limit, stop, or stop-limit)."""

    # Verify membership
    account = get_trading_account(
        trading_account_id=payload.trading_account_id,
        user=user,
        db=db,
    )

    quantity = Decimal(payload.quantity)
    limit_price = Decimal(payload.limit_price) if payload.limit_price else None
    stop_price = Decimal(payload.stop_price) if payload.stop_price else None

    # Pre-trade validation
    try:
        validate_order_request(
            account=account,
            db=db,
            symbol=payload.symbol,
            asset_type=payload.asset_type,
            side=payload.side,
            order_type=payload.order_type,
            time_in_force=payload.time_in_force,
            quantity=quantity,
            limit_price=limit_price,
            stop_price=stop_price,
        )
    except OrderValidationError as e:
        raise HTTPException(status_code=400, detail=e.detail)

    # Create order
    order = Order(
        trading_account_id=account.id,
        symbol=payload.symbol,
        asset_type=payload.asset_type,
        side=payload.side,
        order_type=payload.order_type,
        time_in_force=payload.time_in_force,
        quantity=quantity,
        limit_price=limit_price,
        stop_price=stop_price,
    )

    price = Decimal(payload.price) if payload.price else None

    if payload.order_type == "market":
        # Market orders execute immediately at the provided price.
        # The caller (frontend) is responsible for supplying the current market price.
        if price is None:
            raise HTTPException(
                status_code=400,
                detail="Market orders require a price (the current market price).",
            )

        try:
            validate_buying_power(account, payload.side, quantity, price)
        except OrderValidationError as e:
            raise HTTPException(status_code=400, detail=e.detail)

        order.status = "pending"
        db.add(order)
        db.flush()  # get order.id

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
            payload.symbol,
            price,
            account.id,
        )

    else:
        # Limit, stop, stop-limit: park as open
        # Buying power check for limit buy orders (reserve funds at limit price)
        if (
            payload.side == "buy"
            and payload.order_type in ("limit", "stop_limit")
            and limit_price
        ):
            try:
                validate_buying_power(account, payload.side, quantity, limit_price)
            except OrderValidationError as e:
                raise HTTPException(status_code=400, detail=e.detail)

        order.status = "open"
        db.add(order)
        db.commit()
        db.refresh(order)

        logger.info(
            "Order placed: %s %s %s (%s) for account %d, status=%s",
            payload.side,
            quantity,
            payload.symbol,
            payload.order_type,
            account.id,
            order.status,
        )

    return _order_to_dict(order)


@router.get("/orders")
def list_orders(
    trading_account_id: int,
    status: str | None = Query(None),
    symbol: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List orders for a trading account with optional filters and pagination."""

    # Verify membership
    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)

    query = db.query(Order).filter(Order.trading_account_id == trading_account_id)

    if status:
        query = query.filter(Order.status == status)
    if symbol:
        query = query.filter(Order.symbol == symbol.upper().strip())

    total = query.count()
    orders = (
        query.order_by(Order.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "orders": [_order_to_dict(o) for o in orders],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single order with its transaction history."""

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verify membership
    get_trading_account(trading_account_id=order.trading_account_id, user=user, db=db)

    result = _order_to_dict(order)
    result["transactions"] = [
        {
            "id": t.id,
            "quantity": str(t.quantity),
            "price": str(t.price),
            "total": str(t.total),
            "side": t.side,
            "created_at": t.created_at.isoformat(),
        }
        for t in order.transactions
    ]
    return result


@router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel an open or partially-filled order."""

    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # Verify membership
    get_trading_account(trading_account_id=order.trading_account_id, user=user, db=db)

    if order.status not in ("open", "partially_filled"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status '{order.status}'",
        )

    order.status = "cancelled"
    db.commit()
    db.refresh(order)

    logger.info("Order %d cancelled for account %d", order.id, order.trading_account_id)

    return _order_to_dict(order)
