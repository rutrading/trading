"""Transaction-creation helpers."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import TradingAccount, Transaction
from app.services.trading import to_money


def create_deposit(
    db: Session,
    account: TradingAccount,
    amount: Decimal,
) -> Transaction:
    """Insert a deposit transaction and increment ``account.balance``.

    Caller owns the transaction boundary; flushes but does not commit.
    Raises ``ValueError`` if amount <= 0.
    """
    if amount <= 0:
        raise ValueError(f"Deposit amount must be > 0, got {amount}")

    quantized = to_money(amount)
    txn = Transaction(
        kind="deposit",
        trading_account_id=account.id,
        total=quantized,
    )
    db.add(txn)
    account.balance = to_money(account.balance + quantized)
    account.updated_at = datetime.now(timezone.utc)
    db.flush()
    return txn
