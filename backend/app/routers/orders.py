"""Order endpoints: place, list, get, and cancel orders."""

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Order, get_db
from app.db.models import DailyBar, Holding, Quote, TradingAccount
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
    compute_market_fill_price,
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
    limit_price: str | None = None  # required for limit / stop_limit
    stop_price: str | None = None  # required for stop / stop_limit

    @field_validator("ticker")
    @classmethod
    def clean_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("quantity", "limit_price", "stop_price")
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


def _mock_order_response(payload: "PlaceOrderRequest") -> OrderResponse:
    now = datetime.now(timezone.utc).isoformat()
    return OrderResponse(
        id=0,
        trading_account_id=payload.trading_account_id,
        ticker=payload.ticker,
        asset_class=payload.asset_class,
        side=payload.side,
        order_type=payload.order_type,
        time_in_force=payload.time_in_force,
        quantity=payload.quantity,
        limit_price=payload.limit_price,
        stop_price=payload.stop_price,
        filled_quantity="0",
        average_fill_price=None,
        status="pending",
        rejection_reason=None,
        created_at=now,
        updated_at=now,
    )


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

    # crypto trades 24/7 — always gtc regardless of what was sent
    time_in_force = "gtc" if payload.asset_class == "crypto" else payload.time_in_force

    try:
        validate_order_request(
            account=account,
            db=db,
            ticker=payload.ticker,
            asset_class=payload.asset_class,
            side=payload.side,
            order_type=payload.order_type,
            time_in_force=time_in_force,
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
        time_in_force=time_in_force,
        quantity=quantity,
        limit_price=limit_price,
        stop_price=stop_price,
    )

    # lock the account row before any balance/reservation reads or writes so
    # concurrent orders cannot race past the buying-power check and together
    # overdraw the account
    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == account.id)
        .with_for_update()
        .first()
    )

    # for non-market buy orders, compute rps before the buying power check so
    # the check validates against the actual reservation amount — not just the
    # raw stop/limit price. for stop orders rps > stop_price (ATR buffer), so
    # checking against stop_price would allow over-reservation.
    rps: Decimal | None = None
    if payload.order_type != "market" and payload.side == "buy":
        if payload.order_type == "stop":
            atr = compute_atr(payload.ticker, db)
            rps = compute_stop_reservation_per_share(stop_price, atr)
        elif payload.order_type in ("limit", "stop_limit"):
            rps = limit_price

        if rps is not None:
            try:
                validate_buying_power(account, payload.side, quantity, rps)
            except OrderValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.detail)

    if payload.order_type == "market":
        # backend owns the price — never trust the client for market fills
        quote = db.query(Quote).filter(Quote.ticker == payload.ticker).first()
        if quote is None or quote.price is None:
            raise HTTPException(
                status_code=400,
                detail=f"No current price available for {payload.ticker}. Try again in a moment.",
            )
        market_price = Decimal(str(quote.price))

        # compute slippage-adjusted fill price before the buying power check so
        # the check uses the actual fill cost — not just the raw quoted price.
        # a user with exactly enough balance at the quote would otherwise pass
        # validation but then fail the pre-fill check inside execute_fill.
        latest_bar = (
            db.query(DailyBar)
            .filter(DailyBar.ticker == payload.ticker)
            .order_by(DailyBar.date.desc())
            .first()
        )
        daily_volume = (
            Decimal(str(latest_bar.volume))
            if latest_bar and latest_bar.volume
            else None
        )
        fill_price = compute_market_fill_price(market_price, payload.side, quantity, daily_volume)

        # buying power check against the slippage-adjusted fill price
        if payload.side == "buy":
            try:
                validate_buying_power(account, payload.side, quantity, fill_price)
            except OrderValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.detail)

        order.status = "pending"
        db.add(order)
        db.flush()  # get order.id before creating transactions

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=fill_price,
            fill_quantity=quantity,
        )
        db.commit()
        db.refresh(order)

        logger.info(
            "Market order filled: %s %s %s @ %s (quoted %s, slippage %.4f%%) for account %d",
            payload.side,
            quantity,
            payload.ticker,
            fill_price,
            market_price,
            float((fill_price - market_price) / market_price * 100) if market_price else 0.0,
            account.id,
        )

    else:
        # rps was already computed above for the buying power check — use it directly
        if payload.side == "buy" and rps is not None:
            order.reserved_per_share = rps
            account.reserved_balance += quantity * rps
            account.updated_at = datetime.now(timezone.utc)

        # for non-market sell orders, commit the shares so concurrent sell orders
        # cannot exceed the available position (mirrors reserved_balance for buys)
        if payload.side == "sell":
            holding = (
                db.query(Holding)
                .filter(
                    Holding.trading_account_id == account.id,
                    Holding.ticker == payload.ticker,
                )
                .with_for_update()
                .first()
            )
            if holding is not None:
                holding.reserved_quantity += quantity
                holding.updated_at = datetime.now(timezone.utc)

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
        account = db.query(TradingAccount).filter(TradingAccount.id == order.trading_account_id).with_for_update().first()
        if account is None:
            raise HTTPException(status_code=500, detail="Trading account not found for order")
        account.reserved_balance = max(
            Decimal("0"),
            account.reserved_balance - remaining * order.reserved_per_share,
        )
        account.updated_at = datetime.now(timezone.utc)

    # release reserved_quantity for open non-market sell orders
    if order.side == "sell" and order.order_type != "market":
        remaining = order.quantity - (order.filled_quantity or Decimal("0"))
        holding = (
            db.query(Holding)
            .filter(
                Holding.trading_account_id == order.trading_account_id,
                Holding.ticker == order.ticker,
            )
            .with_for_update()
            .first()
        )
        if holding is not None:
            holding.reserved_quantity = max(
                Decimal("0"),
                holding.reserved_quantity - remaining,
            )
            holding.updated_at = datetime.now(timezone.utc)

    order.status = "cancelled"
    db.commit()
    db.refresh(order)

    logger.info("Order %d cancelled for account %d", order.id, order.trading_account_id)

    return OrderResponse.from_order(order)
