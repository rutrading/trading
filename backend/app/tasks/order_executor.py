"""Order executor background task.

Polls open limit/stop orders every POLL_INTERVAL seconds and calls execute_fill()
when price conditions are met. Also handles opg/cls TIF timing and day-order expiry.
"""

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import DailyBar, Holding, Order, Quote, TradingAccount
from app.db.session import get_session_factory
from app.services.trading import execute_fill

ET = ZoneInfo("America/New_York")
POLL_INTERVAL = 5  # seconds between executor cycles
MARKET_OPEN = (9, 30)
MARKET_CLOSE = (16, 0)
FILL_WINDOW_MINUTES = 5  # window around open/close for opg/cls fills

# 0.05% of daily volume is fillable per poll cycle.
# Liquid large-caps (60M shares/day) → 30,000 fillable: retail orders fill in one cycle.
# Small-caps (200K shares/day) → 100 fillable: larger orders take multiple cycles.
# This produces realistic differentiation between liquid and illiquid stocks.
VOLUME_FILL_RATE = Decimal("0.0005")

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

        # fetch the most recent daily bar volume per ticker in a single query
        latest_date_subq = (
            db.query(DailyBar.ticker, func.max(DailyBar.date).label("max_date"))
            .filter(DailyBar.ticker.in_(tickers))
            .group_by(DailyBar.ticker)
            .subquery()
        )
        recent_bars = (
            db.query(DailyBar)
            .join(
                latest_date_subq,
                (DailyBar.ticker == latest_date_subq.c.ticker)
                & (DailyBar.date == latest_date_subq.c.max_date),
            )
            .all()
        )
        volumes: dict[str, Decimal] = {
            bar.ticker: Decimal(str(bar.volume))
            for bar in recent_bars
            if bar.volume is not None and bar.volume > 0
        }

        for order in open_orders:
            price = quotes.get(order.ticker)
            if price is None:
                continue

            if _should_fill(order, price, now_et):
                account = (
                    db.query(TradingAccount)
                    .filter(TradingAccount.id == order.trading_account_id)
                    .with_for_update()
                    .first()
                )
                if account is None:
                    continue
                # Re-fetch the order with a row lock after acquiring the account
                # lock. A concurrent cancel_order request could have committed
                # between when open_orders was loaded and now — without this
                # re-fetch the stale in-memory order would pass the status check
                # and execute_fill would overwrite the cancellation.
                order = (
                    db.query(Order)
                    .filter(Order.id == order.id)
                    .with_for_update()
                    .first()
                )
                if order is None or order.status not in ("open", "partially_filled"):
                    continue
                remaining = order.quantity - (order.filled_quantity or Decimal("0"))
                fill_quantity = _compute_fill_quantity(remaining, volumes.get(order.ticker))
                result = execute_fill(
                    db=db,
                    order=order,
                    account=account,
                    fill_price=price,
                    fill_quantity=fill_quantity,
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
                remaining = order.quantity - (order.filled_quantity or Decimal("0"))
                # release reserved balance for buy orders
                if order.side == "buy" and order.reserved_per_share is not None:
                    account = (
                        db.query(TradingAccount)
                        .filter(TradingAccount.id == order.trading_account_id)
                        .with_for_update()
                        .first()
                    )
                    if account is not None:
                        account.reserved_balance = max(
                            Decimal("0"),
                            account.reserved_balance - remaining * order.reserved_per_share,
                        )
                        account.updated_at = datetime.now(timezone.utc)
                # release reserved_quantity for non-market sell orders
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
                logger.info(
                    "Executor expired day order %d (%s %s)",
                    order.id,
                    order.side,
                    order.ticker,
                )
    finally:
        db.close()


def _compute_fill_quantity(remaining: Decimal, daily_volume: Decimal | None) -> Decimal:
    """Return how many units to fill this cycle based on daily volume.

    Caps fills at VOLUME_FILL_RATE of the day's volume so large orders on
    illiquid stocks take multiple cycles — mimicking real liquidity constraints.
    Falls back to filling all remaining units when no volume data is available.
    Floors at 1 unit to prevent infinite micro-fill loops on very low-volume tickers.
    """
    if daily_volume is None or daily_volume <= 0:
        return remaining
    fillable = (daily_volume * VOLUME_FILL_RATE).quantize(Decimal("0.000001"))
    return min(remaining, max(Decimal("1"), fillable))


def _should_fill(order: Order, price: Decimal, now_et: datetime) -> bool:
    """Return True if this order's fill condition is satisfied at the given price."""
    tif = order.time_in_force
    ot = order.order_type
    side = order.side
    lp = order.limit_price
    sp = order.stop_price

    # opg/cls: only eligible during the appropriate time window; if not in the
    # window return False immediately, otherwise fall through to price conditions
    if tif == "opg" and not _in_window(now_et, MARKET_OPEN):
        return False
    if tif == "cls" and not _in_window(now_et, MARKET_CLOSE):
        return False

    if ot == "limit":
        if lp is None:
            return False
        return (side == "buy" and price <= lp) or (side == "sell" and price >= lp)

    if ot == "stop":
        if sp is None:
            return False
        return (side == "buy" and price >= sp) or (side == "sell" and price <= sp)

    if ot == "stop_limit":
        if sp is None or lp is None:
            return False
        # stop must trigger first, then price must be within limit
        triggered = (side == "buy" and price >= sp) or (side == "sell" and price <= sp)
        if not triggered:
            return False
        return (side == "buy" and price <= lp) or (side == "sell" and price >= lp)

    return False


def _should_expire(order: Order, now_et: datetime) -> bool:
    """Return True if an order has passed market close and should be cancelled.

    day orders expire at close. opg and cls orders also expire at close — if
    they missed their fill window they will never fill and should be cleaned up.
    """
    if order.time_in_force not in ("day", "opg", "cls"):
        return False
    return (now_et.hour, now_et.minute) >= MARKET_CLOSE


def _in_window(now_et: datetime, target: tuple[int, int]) -> bool:
    """Return True if current ET time is within FILL_WINDOW_MINUTES of target."""
    target_dt = now_et.replace(
        hour=target[0], minute=target[1], second=0, microsecond=0
    )
    return abs((now_et - target_dt).total_seconds()) < FILL_WINDOW_MINUTES * 60
