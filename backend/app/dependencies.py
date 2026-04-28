"""Authorization dependencies for account-scoped endpoints.

auth.py handles identity (who is the user).
This module handles account membership checks (what they can access).
"""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import AccountMember, Order, TradingAccount, get_db


def _load_trading_account(db: Session, trading_account_id: int) -> TradingAccount:
    account = (
        db.query(TradingAccount).filter(TradingAccount.id == trading_account_id).first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trading account not found",
        )
    return account


def _is_account_member(db: Session, trading_account_id: int, user_id: str) -> bool:
    membership = (
        db.query(AccountMember)
        .filter(
            AccountMember.account_id == trading_account_id,
            AccountMember.user_id == user_id,
        )
        .first()
    )
    return membership is not None


def get_trading_account(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradingAccount:
    """Verify the current user is a member of the trading account and return it.

    Use as a FastAPI dependency on any endpoint that operates on a trading account.
    In SKIP_AUTH / dev mode (user sub == "dev"), the membership check is bypassed.
    """
    account = _load_trading_account(db, trading_account_id)

    user_id = str(user.get("sub", "")).strip()
    if user_id == "dev":
        return account

    if not _is_account_member(db, trading_account_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this trading account",
        )

    return account


def assert_owns_order(order: Order, user: dict, db: Session) -> TradingAccount:
    """Membership check that maps 403 → 404 so order IDs cannot be enumerated
    across tenants by watching the 403-vs-404 split.

    Returns the trading account on success.
    """
    try:
        return get_trading_account(
            trading_account_id=order.trading_account_id, user=user, db=db
        )
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(status_code=404, detail="Order not found") from exc
        raise
