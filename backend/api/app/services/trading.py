"""Core trading execution logic.

Handles order validation, fill execution, holding updates, and balance changes.
All mutating helpers expect to be called inside an existing DB session/transaction.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import Holding, Order, TradingAccount, Transaction

VALID_ASSET_TYPES = {"stock", "etf", "crypto"}
VALID_SIDES = {"buy", "sell"}
VALID_ORDER_TYPES = {"market", "limit", "stop", "stop_limit"}
VALID_TIME_IN_FORCE = {"day", "gtc"}


class OrderValidationError(Exception):
    """Raised when an order fails pre-trade validation."""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def validate_order_request(
    *,
    account: TradingAccount,
    db: Session,
    symbol: str,
    asset_type: str,
    side: str,
    order_type: str,
    time_in_force: str,
    quantity: Decimal,
    limit_price: Decimal | None,
    stop_price: Decimal | None,
) -> None:
    """Run all pre-trade validation checks. Raises OrderValidationError on failure."""

    if asset_type not in VALID_ASSET_TYPES:
        raise OrderValidationError(f"Invalid asset_type: {asset_type}")
    if side not in VALID_SIDES:
        raise OrderValidationError(f"Invalid side: {side}")
    if order_type not in VALID_ORDER_TYPES:
        raise OrderValidationError(f"Invalid order_type: {order_type}")
    if time_in_force not in VALID_TIME_IN_FORCE:
        raise OrderValidationError(f"Invalid time_in_force: {time_in_force}")

    if quantity <= 0:
        raise OrderValidationError("Quantity must be greater than 0")

    # Crypto must use GTC
    if asset_type == "crypto" and time_in_force == "day":
        raise OrderValidationError("Crypto orders must use 'gtc' time-in-force")

    # Limit price required for limit and stop_limit orders
    if order_type in ("limit", "stop_limit") and limit_price is None:
        raise OrderValidationError(f"limit_price is required for {order_type} orders")
    if limit_price is not None and limit_price <= 0:
        raise OrderValidationError("limit_price must be greater than 0")

    # Stop price required for stop and stop_limit orders
    if order_type in ("stop", "stop_limit") and stop_price is None:
        raise OrderValidationError(f"stop_price is required for {order_type} orders")
    if stop_price is not None and stop_price <= 0:
        raise OrderValidationError("stop_price must be greater than 0")

    # Sell validation: must own enough of the position
    if side == "sell":
        holding = (
            db.query(Holding)
            .filter(
                Holding.trading_account_id == account.id,
                Holding.symbol == symbol,
            )
            .first()
        )
        if holding is None or holding.quantity < quantity:
            owned = holding.quantity if holding else Decimal("0")
            raise OrderValidationError(
                f"Insufficient position: you own {owned} of {symbol}, tried to sell {quantity}"
            )


def validate_buying_power(
    account: TradingAccount,
    side: str,
    quantity: Decimal,
    price: Decimal,
) -> None:
    """Check that the account has enough cash for a buy order at the given price."""
    if side == "buy":
        total_cost = quantity * price
        if account.balance < total_cost:
            raise OrderValidationError(
                f"Insufficient buying power: need ${total_cost:.2f}, have ${account.balance:.2f}"
            )


def execute_fill(
    *,
    db: Session,
    order: Order,
    account: TradingAccount,
    fill_price: Decimal,
    fill_quantity: Decimal,
) -> Transaction:
    """Execute a fill against an order. Updates order, holding, balance, and creates a transaction.

    Must be called within a db transaction (caller handles commit).
    """
    total = fill_quantity * fill_price

    # --- Update order ---
    old_filled = order.filled_quantity or Decimal("0")
    new_filled = old_filled + fill_quantity

    # Weighted average fill price
    if old_filled == 0:
        order.average_fill_price = fill_price
    else:
        old_avg = order.average_fill_price or Decimal("0")
        order.average_fill_price = (
            (old_avg * old_filled) + (fill_price * fill_quantity)
        ) / new_filled

    order.filled_quantity = new_filled

    if new_filled >= order.quantity:
        order.status = "filled"
    else:
        order.status = "partially_filled"

    order.updated_at = datetime.now(timezone.utc)

    # --- Update holding ---
    holding = (
        db.query(Holding)
        .filter(
            Holding.trading_account_id == account.id,
            Holding.symbol == order.symbol,
        )
        .first()
    )

    if order.side == "buy":
        if holding is None:
            holding = Holding(
                trading_account_id=account.id,
                symbol=order.symbol,
                asset_type=order.asset_type,
                quantity=fill_quantity,
                average_cost=fill_price,
            )
            db.add(holding)
        else:
            # Weighted average cost basis
            old_qty = holding.quantity
            old_cost = holding.average_cost
            holding.average_cost = (
                (old_qty * old_cost) + (fill_quantity * fill_price)
            ) / (old_qty + fill_quantity)
            holding.quantity = old_qty + fill_quantity
            holding.updated_at = datetime.now(timezone.utc)

        # Deduct from balance
        account.balance -= total

    elif order.side == "sell":
        if holding is not None:
            holding.quantity -= fill_quantity
            holding.updated_at = datetime.now(timezone.utc)
            # Remove holding row if fully sold
            if holding.quantity <= 0:
                db.delete(holding)

        # Add to balance
        account.balance += total

    account.updated_at = datetime.now(timezone.utc)

    # --- Create transaction record ---
    txn = Transaction(
        order_id=order.id,
        trading_account_id=account.id,
        symbol=order.symbol,
        side=order.side,
        quantity=fill_quantity,
        price=fill_price,
        total=total,
    )
    db.add(txn)

    return txn
