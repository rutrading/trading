"""Core trading execution logic.

Handles order validation, fill execution, holding updates, and balance changes.
All mutating helpers expect to be called inside an existing DB session/transaction.
"""

import logging
from datetime import datetime, timezone
from decimal import ROUND_HALF_EVEN, Decimal

from sqlalchemy.orm import Session

from app.db.models import Holding, Order, TradingAccount, Transaction

logger = logging.getLogger(__name__)

VALID_ASSET_CLASSES = {"us_equity", "crypto"}
VALID_SIDES = {"buy", "sell"}
VALID_ORDER_TYPES = {"market", "limit", "stop", "stop_limit"}
VALID_TIME_IN_FORCE = {"day", "gtc", "opg", "cls"}

STOP_RESERVATION_P = Decimal("0.02")  # 2% price buffer
STOP_RESERVATION_K = Decimal("1.5")   # 1.5× ATR multiplier

MARKET_BASE_SLIPPAGE = Decimal("0.0005")  # 0.05% — simulates the bid-ask spread
MARKET_IMPACT_FACTOR = Decimal("0.05")    # 5% — scales order size vs. daily volume
MARKET_MAX_SLIPPAGE = Decimal("0.02")     # 2% ceiling — prevents unrealistic fills on illiquid names

# trading_account.balance, trading_account.reserved_balance, and
# transaction.total are all numeric(14,2). Decimal arithmetic at the prevailing
# context precision can produce up-to-18-fractional-digit intermediates (price
# at scale 10 × quantity at scale 8). Postgres silently rounds on UPDATE, but
# the in-memory value mutated via `+=` keeps the high-precision form, so the
# next read-back from the DB drifts. Quantize on every write so in-memory and
# persisted views stay in lockstep.
_MONEY_QUANT = Decimal("0.01")


def _to_money(value: Decimal) -> Decimal:
    """Round a Decimal money value to numeric(14,2), banker's rounding."""
    return value.quantize(_MONEY_QUANT, rounding=ROUND_HALF_EVEN)


class OrderValidationError(Exception):
    """Raised when an order fails pre-trade validation."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def validate_order_request(
    *,
    account: TradingAccount,
    db: Session,
    ticker: str,
    asset_class: str,
    side: str,
    order_type: str,
    time_in_force: str,
    quantity: Decimal,
    limit_price: Decimal | None,
    stop_price: Decimal | None,
) -> None:
    """Run all pre-trade validation checks. Raises OrderValidationError on failure."""

    # reject unknown asset class
    if asset_class not in VALID_ASSET_CLASSES:
        raise OrderValidationError(f"Invalid asset_class: {asset_class}")
    if side not in VALID_SIDES:
        raise OrderValidationError(f"Invalid side: {side}")
    if order_type not in VALID_ORDER_TYPES:
        raise OrderValidationError(f"Invalid order_type: {order_type}")
    if time_in_force not in VALID_TIME_IN_FORCE:
        raise OrderValidationError(f"Invalid time_in_force: {time_in_force}")

    if quantity <= 0:
        raise OrderValidationError("Quantity must be greater than 0")

    # crypto must use GTC (no day orders for 24/7 markets)
    if asset_class == "crypto" and time_in_force == "day":
        raise OrderValidationError("Crypto orders must use 'gtc' time-in-force")

    # crypto cannot use open/close TIF (no market open/close for 24/7 markets)
    if asset_class == "crypto" and time_in_force in ("opg", "cls"):
        raise OrderValidationError("Crypto orders cannot use 'opg' or 'cls' time-in-force")

    # reject extraneous price fields — storing them corrupts order semantics
    if order_type == "market" and limit_price is not None:
        raise OrderValidationError("limit_price is not valid for market orders")
    if order_type == "market" and stop_price is not None:
        raise OrderValidationError("stop_price is not valid for market orders")
    if order_type == "limit" and stop_price is not None:
        raise OrderValidationError("stop_price is not valid for limit orders")
    if order_type == "stop" and limit_price is not None:
        raise OrderValidationError("limit_price is not valid for stop orders")

    # limit price required for limit and stop_limit orders
    if order_type in ("limit", "stop_limit") and limit_price is None:
        raise OrderValidationError(f"limit_price is required for {order_type} orders")
    if limit_price is not None and limit_price <= 0:
        raise OrderValidationError("limit_price must be greater than 0")

    # stop price required for stop and stop_limit orders
    if order_type in ("stop", "stop_limit") and stop_price is None:
        raise OrderValidationError(f"stop_price is required for {order_type} orders")
    if stop_price is not None and stop_price <= 0:
        raise OrderValidationError("stop_price must be greater than 0")

    # stop-limit price relationship validation
    if order_type == "stop_limit" and stop_price is not None and limit_price is not None:
        if side == "buy" and stop_price > limit_price:
            raise OrderValidationError(
                "For buy stop-limit orders, stop_price must be <= limit_price"
            )
        if side == "sell" and stop_price < limit_price:
            raise OrderValidationError(
                "For sell stop-limit orders, stop_price must be >= limit_price"
            )

    # sell validation: must have enough shares available (not already committed to open sell orders)
    if side == "sell":
        holding = (
            db.query(Holding)
            .filter(
                Holding.trading_account_id == account.id,
                Holding.ticker == ticker,
            )
            .with_for_update()
            .first()
        )
        if holding is None:
            raise OrderValidationError(
                f"Insufficient position: you own 0 of {ticker}, tried to sell {quantity}"
            )
        # available = total held minus shares already committed to open sell orders
        available = holding.quantity - holding.reserved_quantity
        if available < quantity:
            raise OrderValidationError(
                f"Insufficient position: {available} shares available to sell of {ticker}, tried to sell {quantity}"
            )


def compute_stop_reservation_per_share(stop_price: Decimal, atr: Decimal) -> Decimal:
    """Per-share reservation for a stop buy order using an ATR-based buffer.

    Uses max(stop × (1 + p), stop + k × ATR) so that:
    - volatile stocks: ATR term dominates, reserving more headroom
    - calm stocks: percentage floor kicks in
    """
    option_a = stop_price * (1 + STOP_RESERVATION_P)
    option_b = stop_price + STOP_RESERVATION_K * atr
    return max(option_a, option_b)


def compute_market_fill_price(
    quote_price: Decimal,
    side: str,
    quantity: Decimal,
    daily_volume: Decimal | None,
) -> Decimal:
    """Return the slippage-adjusted fill price for a market order.

    Slippage = base spread + market impact proportional to order size vs. daily volume.
    Buys fill slightly above the quoted price; sells fill slightly below — both work
    against the trader, which is correct.

    Falls back to base slippage alone when no daily volume data is available.

    Quantized to 10 decimal places to match the numeric(20,10) price columns
    so the returned value round-trips through the DB without silent rounding.
    """
    impact = (quantity / daily_volume) * MARKET_IMPACT_FACTOR if daily_volume and daily_volume > 0 else Decimal("0")
    slippage = min(MARKET_BASE_SLIPPAGE + impact, MARKET_MAX_SLIPPAGE)
    if side == "buy":
        raw = quote_price * (1 + slippage)
    else:
        raw = quote_price * (1 - slippage)
    return raw.quantize(Decimal("0.0000000001"), rounding=ROUND_HALF_EVEN)


def validate_buying_power(
    account: TradingAccount,
    side: str,
    quantity: Decimal,
    price: Decimal,
) -> None:
    """Check that the account has enough buying power for a buy order.

    Placement-only: this helper assumes the order's reservation has not yet
    been added to account.reserved_balance, so it does not subtract the
    caller's own existing reservation. Re-validating an already-open order
    with this helper would double-count its reservation. The fill-time
    safety net inside execute_fill handles the open-order case explicitly
    (subtracting `remaining * per_share` to compute "other_reserved").

    Reads account.reserved_balance directly — no extra DB query needed.
    """
    if side == "buy":
        total_cost = quantity * price
        available = account.balance - account.reserved_balance
        if available < total_cost:
            raise OrderValidationError(
                f"Insufficient buying power: need ${total_cost:.2f}, have ${available:.2f} available"
            )


def execute_fill(
    *,
    db: Session,
    order: Order,
    account: TradingAccount,
    fill_price: Decimal,
    fill_quantity: Decimal,
) -> "Transaction | None":
    """Execute a fill against an order. Updates order, holding, balance, and creates a transaction.

    Returns None if the fill is rejected because the account no longer has sufficient funds
    (order is cancelled and reservation released). Caller must not commit in that case since
    execute_fill already updates the order and account — just commit to persist the cancellation.

    Must be called within a db transaction (caller handles commit).
    """
    # re-fetch with a row lock so the balance check and mutations below always
    # see the latest committed state, even when called from a background worker
    # that didn't lock the account itself
    account = (
        db.query(TradingAccount)
        .filter(TradingAccount.id == account.id)
        .with_for_update()
        .first()
    )

    # `total` lands in transaction.total (numeric(14,2)) and drives the
    # account.balance update — quantize once here so every downstream consumer
    # sees the same value Postgres will store.
    total = _to_money(fill_quantity * fill_price)

    # pre-fill balance check for buy orders — safety net in case funds were
    # consumed by other orders between placement and execution
    if order.side == "buy":
        remaining = order.quantity - (order.filled_quantity or Decimal("0"))
        per_share = order.reserved_per_share or Decimal("0")
        # subtract this order's own reservation to get what other orders need
        other_reserved = account.reserved_balance - remaining * per_share
        available = account.balance - other_reserved
        if available < total:
            order.status = "cancelled"
            order.rejection_reason = "Insufficient buying power at fill time"
            account.reserved_balance = _to_money(
                max(
                    Decimal("0"),
                    account.reserved_balance - remaining * per_share,
                )
            )
            account.updated_at = datetime.now(timezone.utc)
            return None

    # update order fill tracking
    old_filled = order.filled_quantity or Decimal("0")
    new_filled = old_filled + fill_quantity

    # weighted average fill price
    if old_filled == 0:
        order.average_fill_price = fill_price
    else:
        old_avg = order.average_fill_price or Decimal("0")
        order.average_fill_price = (
            (old_avg * old_filled) + (fill_price * fill_quantity)
        ) / new_filled

    order.filled_quantity = new_filled

    # mark fully filled or partially filled
    if new_filled >= order.quantity:
        order.status = "filled"
    else:
        order.status = "partially_filled"

    order.updated_at = datetime.now(timezone.utc)

    # find or create holding for this ticker
    holding = (
        db.query(Holding)
        .filter(
            Holding.trading_account_id == account.id,
            Holding.ticker == order.ticker,
        )
        .first()
    )

    if order.side == "buy":
        if holding is None:
            holding = Holding(
                trading_account_id=account.id,
                ticker=order.ticker,
                asset_class=order.asset_class,
                quantity=fill_quantity,
                average_cost=fill_price,
            )
            db.add(holding)
        else:
            # weighted average cost basis
            old_qty = holding.quantity
            old_cost = holding.average_cost
            holding.average_cost = (
                (old_qty * old_cost) + (fill_quantity * fill_price)
            ) / (old_qty + fill_quantity)
            holding.quantity = old_qty + fill_quantity
            holding.updated_at = datetime.now(timezone.utc)

        # deduct from balance — quantize so the in-memory value matches what
        # numeric(14,2) will store on flush
        account.balance = _to_money(account.balance - total)

        # release the per-share reservation for the filled quantity
        if order.reserved_per_share is not None:
            release = fill_quantity * order.reserved_per_share
            new_reserved = account.reserved_balance - release
            if new_reserved < 0:
                # Clamp is defense-in-depth; with explicit money quantize in
                # place this should not fire under normal operation. If it
                # does, surface it so we can investigate the underlying
                # accounting drift.
                logger.warning(
                    "Reserved balance underflow on fill: account=%d order=%d "
                    "release=%s reserved_before=%s — clamping to 0",
                    account.id,
                    order.id,
                    release,
                    account.reserved_balance,
                )
            account.reserved_balance = _to_money(max(Decimal("0"), new_reserved))

    elif order.side == "sell":
        if holding is None:
            # position was closed by another order before this one filled —
            # cancel rather than ghost-crediting proceeds for shares not owned
            order.status = "cancelled"
            order.rejection_reason = "Position no longer exists at fill time"
            order.updated_at = datetime.now(timezone.utc)
            return None

        holding.quantity -= fill_quantity
        # release the reserved_quantity for the filled shares (non-market sell orders)
        if order.order_type != "market":
            holding.reserved_quantity = max(
                Decimal("0"),
                holding.reserved_quantity - fill_quantity,
            )
        holding.updated_at = datetime.now(timezone.utc)
        # remove holding row if fully sold
        if holding.quantity <= 0:
            db.delete(holding)

        # add proceeds to balance — quantize so the in-memory value matches
        # what numeric(14,2) will store on flush
        account.balance = _to_money(account.balance + total)

    account.updated_at = datetime.now(timezone.utc)

    # create transaction record
    txn = Transaction(
        order_id=order.id,
        trading_account_id=account.id,
        ticker=order.ticker,
        side=order.side,
        quantity=fill_quantity,
        price=fill_price,
        total=total,
    )
    db.add(txn)

    return txn
