"""Shared order-placement service used by manual and automated flows."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import DailyBar, Holding, Order, Quote, TradingAccount
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


@dataclass(frozen=True)
class PlaceOrderInput:
    ticker: str
    asset_class: str
    side: str
    order_type: str
    time_in_force: str
    quantity: Decimal
    limit_price: Decimal | None = None
    stop_price: Decimal | None = None


class OrderPlacementError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def place_order(
    *,
    db: Session,
    account: TradingAccount,
    payload: PlaceOrderInput,
) -> Order:
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
            quantity=payload.quantity,
            limit_price=payload.limit_price,
            stop_price=payload.stop_price,
        )
    except OrderValidationError as exc:
        raise OrderPlacementError(exc.detail)

    order = Order(
        trading_account_id=account.id,
        ticker=payload.ticker,
        asset_class=payload.asset_class,
        side=payload.side,
        order_type=payload.order_type,
        time_in_force=time_in_force,
        quantity=payload.quantity,
        limit_price=payload.limit_price,
        stop_price=payload.stop_price,
    )

    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == account.id)
        .with_for_update()
        .first()
    )
    if account is None:
        raise OrderPlacementError("Trading account not found")

    rps: Decimal | None = None
    if payload.order_type != "market" and payload.side == "buy":
        if payload.order_type == "stop":
            if payload.stop_price is None:
                raise OrderPlacementError("stop_price is required for stop orders")
            atr = compute_atr(payload.ticker, db)
            rps = compute_stop_reservation_per_share(payload.stop_price, atr)
        elif payload.order_type in ("limit", "stop_limit"):
            rps = payload.limit_price

        if rps is not None:
            try:
                validate_buying_power(account, payload.side, payload.quantity, rps)
            except OrderValidationError as exc:
                raise OrderPlacementError(exc.detail)

    if payload.order_type == "market":
        quote = db.query(Quote).filter(Quote.ticker == payload.ticker).first()
        if quote is None or quote.price is None:
            raise OrderPlacementError(
                f"No current price available for {payload.ticker}. Try again in a moment."
            )
        market_price = Decimal(str(quote.price))

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
        fill_price = compute_market_fill_price(
            market_price, payload.side, payload.quantity, daily_volume
        )

        if payload.side == "buy":
            try:
                validate_buying_power(
                    account, payload.side, payload.quantity, fill_price
                )
            except OrderValidationError as exc:
                raise OrderPlacementError(exc.detail)

        order.status = "pending"
        db.add(order)
        db.flush()

        execute_fill(
            db=db,
            order=order,
            account=account,
            fill_price=fill_price,
            fill_quantity=payload.quantity,
        )
        db.commit()
        db.refresh(order)

        logger.info(
            "Market order filled: %s %s %s @ %s (quoted %s, slippage %.4f%%) for account %d",
            payload.side,
            payload.quantity,
            payload.ticker,
            fill_price,
            market_price,
            float((fill_price - market_price) / market_price * 100)
            if market_price
            else 0.0,
            account.id,
        )
    else:
        if payload.side == "buy" and rps is not None:
            order.reserved_per_share = rps
            account.reserved_balance += payload.quantity * rps
            account.updated_at = datetime.now(timezone.utc)

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
                holding.reserved_quantity += payload.quantity
                holding.updated_at = datetime.now(timezone.utc)

        order.status = "open"
        db.add(order)
        db.commit()
        db.refresh(order)

        logger.info(
            "Order placed: %s %s %s (%s) for account %d, status=%s",
            payload.side,
            payload.quantity,
            payload.ticker,
            payload.order_type,
            account.id,
            order.status,
        )

    return order
