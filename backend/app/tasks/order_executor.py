"""Order executor background task.

Polls open limit/stop orders every POLL_INTERVAL seconds and calls execute_fill()
when price conditions are met. Also handles opg/cls TIF timing and day-order expiry.
"""

import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.db.models import Order, Quote, TradingAccount
from app.db.session import get_session_factory
from app.services.trading import execute_fill

ET = ZoneInfo("America/New_York")
POLL_INTERVAL = 5  # seconds between executor cycles
MARKET_OPEN = (9, 30)
MARKET_CLOSE = (16, 0)
FILL_WINDOW_MINUTES = 5  # window around open/close for opg/cls fills

logger = logging.getLogger(__name__)


async def run_order_executor() -> None:
    """Asyncio background task: continuously poll and fill open orders."""
    logger.info("Order executor started (poll interval: %ds)", POLL_INTERVAL)
    while True:
        try:
            _process_open_orders()
        except Exception:
            logger.exception("Order executor encountered an error")
        await asyncio.sleep(POLL_INTERVAL)


def _process_open_orders() -> None:
    db: Session = get_session_factory()()
    try:
        now_et = datetime.now(ET)
        open_orders = (
            db.query(Order)
            .filter(Order.status.in_(["open", "partially_filled"]))
            .all()
        )
        if not open_orders:
            return

        # fetch one quote per ticker in a single query
        tickers = {o.ticker for o in open_orders}
        quotes: dict[str, Decimal] = {
            q.ticker: Decimal(str(q.price))
            for q in db.query(Quote).filter(Quote.ticker.in_(tickers)).all()
            if q.price is not None
        }

        for order in open_orders:
            price = quotes.get(order.ticker)
            if price is None:
                continue

            if _should_fill(order, price, now_et):
                account = (
                    db.query(TradingAccount)
                    .filter(TradingAccount.id == order.trading_account_id)
                    .first()
                )
                if account is None:
                    continue
                remaining = order.quantity - (order.filled_quantity or Decimal("0"))
                result = execute_fill(
                    db=db,
                    order=order,
                    account=account,
                    fill_price=price,
                    fill_quantity=remaining,
                )
                db.commit()
                if result is None:
                    logger.warning(
                        "Executor cancelled order %d — insufficient funds at fill time",
                        order.id,
                    )
                else:
                    logger.info(
                        "Executor filled order %d (%s %s %s) at %s",
                        order.id,
                        order.side,
                        order.quantity,
                        order.ticker,
                        price,
                    )
            elif _should_expire(order, now_et):
                # release reserved balance before cancelling
                if order.side == "buy" and order.reserved_per_share is not None:
                    account = (
                        db.query(TradingAccount)
                        .filter(TradingAccount.id == order.trading_account_id)
                        .first()
                    )
                    if account is not None:
                        remaining = order.quantity - (order.filled_quantity or Decimal("0"))
                        account.reserved_balance = max(
                            Decimal("0"),
                            account.reserved_balance - remaining * order.reserved_per_share,
                        )
                        account.updated_at = datetime.now(ET)
                order.status = "cancelled"
                db.commit()
                logger.info(
                    "Executor expired day order %d (%s %s)",
                    order.id,
                    order.side,
                    order.ticker,
                )
    finally:
        db.close()


def _should_fill(order: Order, price: Decimal, now_et: datetime) -> bool:
    """Return True if this order's fill condition is satisfied at the given price."""
    tif = order.time_in_force
    ot = order.order_type
    side = order.side
    lp = order.limit_price
    sp = order.stop_price

    # opg/cls: fill during the appropriate market window regardless of order type
    if tif == "opg":
        return _in_window(now_et, MARKET_OPEN)
    if tif == "cls":
        return _in_window(now_et, MARKET_CLOSE)

    if ot == "limit":
        return (side == "buy" and price <= lp) or (side == "sell" and price >= lp)

    if ot == "stop":
        return (side == "buy" and price >= sp) or (side == "sell" and price <= sp)

    if ot == "stop_limit":
        # stop must trigger first, then price must be within limit
        triggered = (side == "buy" and price >= sp) or (side == "sell" and price <= sp)
        if not triggered:
            return False
        return (side == "buy" and price <= lp) or (side == "sell" and price >= lp)

    return False


def _should_expire(order: Order, now_et: datetime) -> bool:
    """Return True if a day order has passed market close and should be cancelled."""
    if order.time_in_force != "day":
        return False
    return (now_et.hour, now_et.minute) >= MARKET_CLOSE


def _in_window(now_et: datetime, target: tuple[int, int]) -> bool:
    """Return True if current ET time is within FILL_WINDOW_MINUTES of target."""
    target_dt = now_et.replace(
        hour=target[0], minute=target[1], second=0, microsecond=0
    )
    return abs((now_et - target_dt).total_seconds()) < FILL_WINDOW_MINUTES * 60
