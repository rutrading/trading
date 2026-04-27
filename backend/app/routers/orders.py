"""Order endpoints: place, list, get, and cancel orders."""

import logging
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import get_config
from app.db import Order, get_db
from app.db.models import DailyBar, Holding, TradingAccount, Transaction
from app.dependencies import get_trading_account
from app.rate_limit import get_order_cancel_limiter, get_order_placement_limiter
from app.schemas import (
    OrderDetailResponse,
    OrderResponse,
    OrdersPageResponse,
    OrderTransactionResponse,
)
from app.services.atr import compute_atr
from app.services.market_calendar import is_stock_market_open
from app.services.quote_cache import resolve_quote
from app.services.trading import (
    OrderValidationError,
    to_money,
    compute_market_fill_price,
    compute_stop_reservation_per_share,
    execute_fill,
    validate_buying_power,
    validate_order_request,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_ET = ZoneInfo("America/New_York")


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


def _get_order_or_404(db: Session, order_id: int, *, for_update: bool = False) -> Order:
    """Look up an order by id. Pass `for_update=True` when the caller
    intends to mutate the row, so the lock is acquired before the
    authz check rather than after — preventing a concurrent writer
    from changing the row out from under the read-modify-write."""
    query = db.query(Order).filter(Order.id == order_id)
    if for_update:
        query = query.with_for_update()
    order = query.first()
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

    # market + opg/cls is a "market-on-open/close" order — it defers to the
    # executor and fills at the next session boundary at the prevailing price,
    # instead of filling instantly the way a plain market order does.
    deferred_market = payload.order_type == "market" and time_in_force in ("opg", "cls")

    # Reject `market` + `day`/`gtc` on US equities outside regular hours.
    # The synchronous market path below would otherwise fill against the
    # last cached `Quote.price` (which off-hours is the prior session's
    # close) — turning a "buy at the market" into "fill instantly at a
    # potentially many-hours-stale price." The Trade form already hides
    # this combo in its TIF dropdown, but a direct API call (curl, replay,
    # custom client) bypasses that — defense has to live here. Crypto
    # bypasses the gate (24/7 markets) and `opg`/`cls` defer to the
    # executor's session-boundary handling, so they're untouched.
    if (
        payload.asset_class == "us_equity"
        and payload.order_type == "market"
        and not deferred_market
        and not is_stock_market_open(datetime.now(timezone.utc).astimezone(_ET))
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Market orders on US equities can only execute during regular "
                "hours (9:30–16:00 ET on weekdays, non-holidays). Use 'opg' "
                "or 'cls' time-in-force to fill at the next session boundary, "
                "or place a limit/stop order to wait for a target price."
            ),
        )

    # Compute ATR before acquiring the trading_account row lock. compute_atr
    # can fall through to a synchronous httpx call to Alpaca with a 10s
    # timeout when the DB has fewer than ATR_PERIODS+1 daily bars cached for
    # the ticker — and that call has no dependency on the locked row state.
    # Holding FOR UPDATE through a 10s network call would freeze every other
    # writer on the same trading account. DailyBar reads stay inline below;
    # quote resolution goes through the shared cache (Redis-first).
    needs_atr = payload.side == "buy" and (
        payload.order_type == "stop" or deferred_market
    )
    pre_atr: Decimal | None = compute_atr(payload.ticker, db) if needs_atr else None

    # Lock the account row first, then run validation (which may acquire the
    # holding row lock for sells). Standardizing on account-first-then-holding
    # everywhere avoids a deadlock window if a future change ever cross-couples
    # the two locks. Re-fetching here is intentional — get_trading_account
    # returned an unlocked row purely for membership verification.
    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == account.id)
        .with_for_update()
        .first()
    )

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

    # create order record (after locking + validating so the in-memory object
    # only exists once we know the order will be persisted)
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

    # for any non-immediate buy, compute rps before the buying power check so
    # the check validates against the actual reservation amount — not just the
    # raw stop/limit price. for stop orders rps > stop_price (ATR buffer); for
    # deferred market orders we don't know the fill price yet, so we use the
    # same stop-style buffer against the current quote.
    rps: Decimal | None = None
    if (payload.order_type != "market" or deferred_market) and payload.side == "buy":
        if deferred_market:
            try:
                quote = await resolve_quote(payload.ticker, db=db)
            except HTTPException as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"No current price available for {payload.ticker}. Try again in a moment.",
                ) from exc
            if quote.price is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"No current price available for {payload.ticker}. Try again in a moment.",
                )
            market_price = Decimal(str(quote.price))
            # Snapshot the quote at placement — the actual session-boundary fill
            # will likely differ but "what the market was when you placed" is
            # what the orders table's Price column shows.
            order.reference_price = market_price
            # ATR was computed pre-lock — see the `needs_atr` block above.
            assert pre_atr is not None
            rps = compute_stop_reservation_per_share(market_price, pre_atr)
        elif payload.order_type == "stop":
            assert pre_atr is not None
            rps = compute_stop_reservation_per_share(stop_price, pre_atr)
        elif payload.order_type in ("limit", "stop_limit"):
            rps = limit_price

        if rps is not None:
            try:
                validate_buying_power(account, payload.side, quantity, rps)
            except OrderValidationError as exc:
                raise HTTPException(status_code=400, detail=exc.detail)

    if payload.order_type == "market" and not deferred_market:
        # Backend owns the price — never trust the client for market fills.
        # Goes through the same Redis -> Postgres -> Alpaca chain the REST
        # `/quote` endpoint uses. Critical: staleness is computed from the
        # data-event `timestamp` field (refreshed by every WS tick), NOT
        # `Quote.updated_at` (a row-mutation column the flush loop never
        # touches — that gave us the "stale 785s" rejection on actively
        # ticking BTC/USD).
        try:
            quote = await resolve_quote(payload.ticker, db=db)
        except HTTPException as exc:
            raise HTTPException(
                status_code=400,
                detail=f"No current price available for {payload.ticker}. Try again in a moment.",
            ) from exc
        if quote.price is None or quote.price <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"No current price available for {payload.ticker}. Try again in a moment.",
            )
        is_live_market = (
            payload.asset_class == "crypto"
            or is_stock_market_open(datetime.now(timezone.utc).astimezone(_ET))
        )
        if is_live_market and quote.timestamp is not None:
            # Defence-in-depth: `resolve_quote` already enforces this on
            # Redis/Postgres hits; this guard only fires when an Alpaca
            # REST fall-through returns a `timestamp` that's itself older
            # than the threshold (genuine upstream stale data).
            staleness = int(time.time()) - quote.timestamp
            if staleness > get_config().quote_staleness_seconds:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Quote for {payload.ticker} is stale "
                        f"({staleness}s old). Try again in a moment."
                    ),
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

        fill_result = execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=fill_price,
            fill_quantity=quantity,
        )
        # Persist the cancellation either way — execute_fill may have stamped
        # order.status = "cancelled" with a rejection_reason (e.g. "position
        # no longer exists at fill time" for a sell, or "insufficient buying
        # power at fill time" for a buy). Returning a 200 OK with a cancelled
        # body silently masks the failure for the client.
        db.commit()
        db.refresh(order)

        if fill_result is None:
            logger.warning(
                "Synchronous market order rejected at fill time: order=%d reason=%s",
                order.id,
                order.rejection_reason,
            )
            raise HTTPException(
                status_code=409,
                detail=order.rejection_reason or "Order could not be filled",
            )

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
            # Quantize to numeric(14,2) so the in-memory value matches what
            # Postgres will persist; otherwise rounding drift accumulates
            # across partial fills and the buying-power check sees a stale
            # higher-precision number.
            account.reserved_balance = to_money(account.reserved_balance + quantity * rps)
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
        # Comma-separated list lets the dashboard's open-orders preview
        # collapse its 3-status fan-out (pending,open,partially_filled)
        # into one request per account instead of three.
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            query = query.filter(Order.status == statuses[0])
        elif statuses:
            query = query.filter(Order.status.in_(statuses))
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

    # Lock the trading_account first (consistent ordering with place_order so
    # we don't deadlock against a concurrent buy), then re-fetch the order
    # under its own row lock and recompute `remaining` from the locked row.
    # Without this, a fill that commits between the read above and the writes
    # below would let us release reserved_balance/reserved_quantity for shares
    # that were just filled — over-releasing the reservation and effectively
    # giving the user back buying-power they already spent.
    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == order.trading_account_id)
        .with_for_update()
        .first()
    )
    if account is None:
        raise HTTPException(status_code=500, detail="Trading account not found for order")

    order = (
        db.query(Order)
        .filter(Order.id == order_id)
        .with_for_update()
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    # Re-check status under the lock — the executor (or another tab) may have
    # already filled or cancelled the order between the initial read and the
    # lock acquisition. A `filled` order has nothing left to cancel.
    if order.status not in ("open", "partially_filled"):
        if order.status == "filled":
            raise HTTPException(
                status_code=409,
                detail="Order was filled before the cancel could be applied",
            )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status '{order.status}'",
        )

    remaining = order.quantity - (order.filled_quantity or Decimal("0"))

    # release reserved balance for open buy orders
    if order.side == "buy" and order.reserved_per_share is not None:
        account.reserved_balance = to_money(
            max(
                Decimal("0"),
                account.reserved_balance - remaining * order.reserved_per_share,
            )
        )
        account.updated_at = datetime.now(timezone.utc)

    # release reserved_quantity for open non-market sell orders
    if order.side == "sell" and order.order_type != "market":
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
