"""Shared FastAPI dependencies for trading endpoints."""

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import AccountMember, TradingAccount, get_db


def get_trading_account(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TradingAccount:
    """Verify the current user is a member of the trading account and return it.

    Use as a FastAPI dependency on any endpoint that operates on a trading account.
    In SKIP_AUTH / dev mode (user sub == "dev"), the membership check is bypassed.
    """
    account = (
        db.query(TradingAccount).filter(TradingAccount.id == trading_account_id).first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trading account not found",
        )

    # Skip membership check for dev user
    user_id = user.get("sub", "")
    if user_id == "dev":
        return account

    membership = (
        db.query(AccountMember)
        .filter(
            AccountMember.account_id == trading_account_id,
            AccountMember.user_id == user_id,
        )
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this trading account",
        )

    return account
