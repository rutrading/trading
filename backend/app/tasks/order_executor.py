"""Order executor background task.

Polls open limit/stop orders every POLL_INTERVAL seconds and calls execute_fill()
when price conditions are met. Also handles opg/cls TIF timing and day-order expiry.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import DailyBar, Holding, Order, Quote, TradingAccount
from app.db.session import get_session_factory
from app.services.market_calendar import NYSE_HOLIDAYS, is_stock_market_open
from app.services.trading import _to_money, compute_market_fill_price, execute_fill

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
    """Asyncio background task: continuously poll and fill open orders.

    `_process_open_orders` is synchronous (SQLAlchemy + blocking row
    locks) and historically ran on the asyncio loop, freezing every
    other coroutine — REST handlers, the WS broadcast loop, and the
    quote flush task — for the full poll cycle. Run it on a worker
    thread so the loop stays responsive while the executor waits on
    Postgres FOR UPDATE locks. The thread hop also means
    `sync_system_tickers` can no longer mutate manager state inline;
    the manager is told about the loop here so it can marshal those
    calls back via `run_coroutine_threadsafe`.
    """
    # Register the running loop on the manager so sync_system_tickers
    # (called from the worker thread below) routes its mutation back
    # onto the loop under `_lock`.
    from app.main import manager as ws_manager  # local to avoid import cycle
    ws_manager.register_loop(asyncio.get_running_loop())

    logger.info("Order executor started (poll interval: %ds)", POLL_INTERVAL)
    while True:
        try:
            await asyncio.to_thread(_process_open_orders)
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

        # Keep the WS feed subscribed to every open-order ticker so the quote
        # table stays warm for executor fills (especially in opg/cls windows
        # where no browser client may be connected). Self-heals every cycle.
        open_tickers = {o.ticker for o in open_orders}
        from app.main import manager as ws_manager  # local to avoid import cycle

        ws_manager.sync_system_tickers(open_tickers)

        if not open_orders:
            return

        # fetch one quote per ticker in a single query
        tickers = open_tickers
        quote_rows = db.query(Quote).filter(Quote.ticker.in_(tickers)).all()
        quotes: dict[str, Decimal] = {
            q.ticker: Decimal(str(q.price)) for q in quote_rows if q.price is not None
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
                # Re-evaluate the fill condition against the freshly-locked
                # order row. The decision above was made against the unlocked
                # snapshot; if amend-order ever lands or any other writer
                # mutates limit_price/stop_price, the locked row is the source
                # of truth and a stale snapshot could fill at a price the user
                # has since revoked.
                if not _should_fill(order, price, now_et):
                    continue
                remaining = order.quantity - (order.filled_quantity or Decimal("0"))
                fill_quantity = _compute_fill_quantity(remaining, volumes.get(order.ticker))
                # The only `market` orders that reach the executor are those
                # whose placement deferred them to the next session boundary
                # (TIF in opg/cls — see place_order's `deferred_market` branch).
                # Plain market orders fill synchronously at placement and never
                # show up here. Apply slippage so the deferred fill mirrors the
                # synchronous market-order path.
                if order.order_type == "market":
                    fill_price = compute_market_fill_price(
                        price, order.side, fill_quantity, volumes.get(order.ticker)
                    )
                else:
                    fill_price = price
                result = execute_fill(
                    db=db,
                    order=order,
                    account=account,
                    fill_price=fill_price,
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
                        fill_price,
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
                        account.reserved_balance = _to_money(
                            max(
                                Decimal("0"),
                                account.reserved_balance - remaining * order.reserved_per_share,
                            )
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

    Crypto edge case: the 1-unit floor was sized for equities (1 share is small).
    On a very low-volume crypto pair where fillable rounds toward zero, a large
    multi-unit order will fill 1 unit/cycle instead of the realism-model rate —
    i.e. faster than a strict liquidity sim says. Small crypto orders are
    unaffected because the outer min(remaining, ...) cap takes precedence.
    Acceptable for paper trading.
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

    # US equities only fill during regular hours, or during their opg/cls window.
    # Without this guard, a day/gtc limit could fill against a stale after-hours
    # quote (e.g. 10pm matching against a 4pm close price).
    if order.asset_class == "us_equity" and tif not in ("opg", "cls"):
        if not _is_stock_market_open(now_et):
            return False

    # opg/cls equities must also respect the trading-day calendar. _in_window
    # alone says "we're within 5 min of 9:30/16:00 clock-time", which on a
    # weekend or NYSE holiday would let an opg market order fill against a
    # stale prior-session close. Restrict to weekdays that aren't NYSE
    # holidays. (Crypto opg/cls is rejected at placement, but be defensive.)
    if order.asset_class == "us_equity" and tif in ("opg", "cls"):
        if not _is_trading_day(now_et):
            return False

    # opg/cls: only eligible during the appropriate time window; if not in the
    # window return False immediately, otherwise fall through to price conditions
    if tif == "opg" and not _in_window(now_et, MARKET_OPEN):
        return False
    if tif == "cls" and not _in_window(now_et, MARKET_CLOSE):
        return False

    # market orders only reach the executor via opg/cls TIF (regular market
    # orders fill synchronously at placement). if we've passed the window gate
    # above, the order is eligible to fill now at the current quote.
    if ot == "market":
        return tif in ("opg", "cls")

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
    """Return True if an order has passed its TIF-specific expiry and should be cancelled.

    Expiry boundaries (ET):
      * day → 16:00 (regular market close)
      * opg → 9:35 (end of opening fill window — 5 min after 9:30 open)
      * cls → 16:05 (end of closing fill window — 5 min after 16:00 close)

    An order expires only if a boundary has passed since it was created. An
    opg order placed at 2pm today will wait for tomorrow's 9:30 fill window
    and only expire after tomorrow's 9:35 if unfilled.

    Boundaries only advance on trading days. A day order placed Friday at 5pm
    must not expire Saturday afternoon — the next eligible 16:00 boundary is
    Monday's. Same for opg/cls: a Friday-placed opg must wait through the
    weekend (and any intervening NYSE holidays) before its window opens.
    """
    tif = order.time_in_force
    if tif == "day":
        h, m = MARKET_CLOSE
    elif tif == "opg":
        h, m = MARKET_OPEN[0], MARKET_OPEN[1] + FILL_WINDOW_MINUTES  # 9:35
    elif tif == "cls":
        h, m = MARKET_CLOSE[0], MARKET_CLOSE[1] + FILL_WINDOW_MINUTES  # 16:05
    else:
        return False

    today_boundary = now_et.replace(hour=h, minute=m, second=0, microsecond=0)

    # Walk backwards from today's boundary to find the most recent trading-day
    # boundary that has actually passed. Cap the walk so a corrupt clock or a
    # decade-stale order can't loop unbounded.
    if now_et >= today_boundary and _is_trading_day(now_et):
        last_boundary: datetime | None = today_boundary
    else:
        last_boundary = None
        cursor = today_boundary - timedelta(days=1)
        for _ in range(14):
            if _is_trading_day(cursor):
                last_boundary = cursor
                break
            cursor -= timedelta(days=1)

    if last_boundary is None:
        return False

    created = order.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    created_et = created.astimezone(ET)
    return created_et < last_boundary


def _is_trading_day(now_et: datetime) -> bool:
    """True when `now_et` falls on a NYSE session day (weekday, non-holiday)."""
    if now_et.weekday() >= 5:
        return False
    return now_et.date() not in NYSE_HOLIDAYS


# Thin alias so existing tests importing `_is_stock_market_open` keep working.
_is_stock_market_open = is_stock_market_open


def _in_window(now_et: datetime, target: tuple[int, int]) -> bool:
    """Return True if current ET time is within FILL_WINDOW_MINUTES of target."""
    target_dt = now_et.replace(
        hour=target[0], minute=target[1], second=0, microsecond=0
    )
    return abs((now_et - target_dt).total_seconds()) < FILL_WINDOW_MINUTES * 60
