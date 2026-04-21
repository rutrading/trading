"""Order endpoints: place, list, get, and cancel orders."""

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import SKIP_AUTH, get_current_user
from app.db import Order, get_db
from app.db.models import DailyBar, Holding, Quote, TradingAccount, Transaction
from app.dependencies import get_trading_account
from app.rate_limit import get_order_cancel_limiter, get_order_placement_limiter
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
    time_in_force: str = "gtc"  # "day" | "gtc" | "opg" | "cls"
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
        reference_price=None,
        filled_quantity="0",
        average_fill_price=None,
        status="pending",
        rejection_reason=None,
        created_at=now,
        updated_at=now,
        last_fill_at=None,
    )


@router.post("/orders")
async def place_order(
    payload: PlaceOrderRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Place a new order (market, limit, stop, or stop-limit)."""

    if SKIP_AUTH:
        return _mock_order_response(payload)

    # Per-user rate limit. Each placement holds a row lock and runs ATR +
    # buying-power math; a stuck client or loop could otherwise saturate the
    # DB. Raises HTTPException(429) when the user exceeds 5/sec or 30/min.
    await get_order_placement_limiter().check(str(user.get("sub", "")))

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

    # market + opg/cls is a "market-on-open/close" order — it defers to the
    # executor and fills at the next session boundary at the prevailing price,
    # instead of filling instantly the way a plain market order does.
    deferred_market = payload.order_type == "market" and time_in_force in ("opg", "cls")

    # for any non-immediate buy, compute rps before the buying power check so
    # the check validates against the actual reservation amount — not just the
    # raw stop/limit price. for stop orders rps > stop_price (ATR buffer); for
    # deferred market orders we don't know the fill price yet, so we use the
    # same stop-style buffer against the current quote.
    rps: Decimal | None = None
    if (payload.order_type != "market" or deferred_market) and payload.side == "buy":
        if deferred_market:
            quote = db.query(Quote).filter(Quote.ticker == payload.ticker).first()
            if quote is None or quote.price is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"No current price available for {payload.ticker}. Try again in a moment.",
                )
            market_price = Decimal(str(quote.price))
            # Snapshot the quote at placement — the actual session-boundary fill
            # will likely differ but "what the market was when you placed" is
            # what the orders table's Price column shows.
            order.reference_price = market_price
            atr = compute_atr(payload.ticker, db)
            rps = compute_stop_reservation_per_share(market_price, atr)
        elif payload.order_type == "stop":
            atr = compute_atr(payload.ticker, db)
            rps = compute_stop_reservation_per_share(stop_price, atr)
        elif payload.order_type in ("limit", "stop_limit"):
            rps = limit_price

        if rps is not None:
            try:
                validate_buying_power(account, payload.side, quantity, rps)
            except OrderValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.detail)

    if payload.order_type == "market" and not deferred_market:
        # backend owns the price — never trust the client for market fills
        quote = db.query(Quote).filter(Quote.ticker == payload.ticker).first()
        if quote is None or quote.price is None:
            raise HTTPException(
                status_code=400,
                detail=f"No current price available for {payload.ticker}. Try again in a moment.",
            )
        market_price = Decimal(str(quote.price))
        # Snapshot the quote we're filling against so the orders table can show
        # "what the market was when you placed this" alongside the actual fill.
        order.reference_price = market_price

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

    if SKIP_AUTH:
        return OrdersPageResponse(orders=[], total=0, page=page, per_page=per_page)

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

    last_fill_by_order = _last_fill_by_order(db, [o.id for o in orders])

    return OrdersPageResponse(
        orders=[
            OrderResponse.from_order(order, last_fill_at=last_fill_by_order.get(order.id))
            for order in orders
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


def _last_fill_by_order(db: Session, order_ids: list[int]) -> dict[int, str]:
    """Return {order_id: max(transaction.created_at) ISO string} in a single query.

    Used to surface the "executed at" timestamp on the orders table without
    an N+1 roundtrip. Orders with no transactions get no entry (the caller
    treats that as "not executed yet").
    """
    if not order_ids:
        return {}
    rows = (
        db.query(Transaction.order_id, func.max(Transaction.created_at))
        .filter(Transaction.order_id.in_(order_ids))
        .group_by(Transaction.order_id)
        .all()
    )
    return {order_id: ts.isoformat() for order_id, ts in rows if ts is not None}


@router.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single order with its transaction history."""

    if SKIP_AUTH:
        raise HTTPException(status_code=404, detail="Order not found")

    order = _get_order_or_404(db, order_id)

    # verify the user owns this order's account, collapsing the existing-but-
    # not-yours case to 404 so attackers can't enumerate valid order IDs by
    # watching for the 403 vs 404 split.
    try:
        get_trading_account(
            trading_account_id=order.trading_account_id, user=user, db=db
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Order not found") from exc
        raise

    last_fill = _last_fill_by_order(db, [order.id]).get(order.id)
    base = OrderResponse.from_order(order, last_fill_at=last_fill)
    return OrderDetailResponse(
        **base.model_dump(),
        transactions=[
            OrderTransactionResponse.from_transaction(transaction)
            for transaction in order.transactions
        ],
    )


@router.post("/orders/{order_id}/cancel")
async def cancel_order(
    order_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel an open or partially-filled order."""

    if SKIP_AUTH:
        raise HTTPException(status_code=404, detail="Order not found")

    # Per-user rate limit. Cancellation also grabs row locks and runs
    # reservation-release math, so it needs the same cap as placement.
    await get_order_cancel_limiter().check(str(user.get("sub", "")))

    order = _get_order_or_404(db, order_id)

    # verify the user owns this order's account, collapsing the existing-but-
    # not-yours case to 404 so attackers can't enumerate valid order IDs by
    # watching for the 403 vs 404 split.
    try:
        get_trading_account(
            trading_account_id=order.trading_account_id, user=user, db=db
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Order not found") from exc
        raise

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
