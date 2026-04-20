"""Trading account mutations: rename, reset balance, delete."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import SKIP_AUTH, get_current_user
from app.db import TradingAccount, get_db
from app.dependencies import get_trading_account

router = APIRouter()

ExperienceLevel = Literal["beginner", "intermediate", "advanced", "expert"]

BALANCE_MAP: dict[ExperienceLevel, Decimal] = {
    "beginner": Decimal("100000"),
    "intermediate": Decimal("50000"),
    "advanced": Decimal("25000"),
    "expert": Decimal("10000"),
}


class AccountMutationResponse(BaseModel):
    id: int
    name: str
    experience_level: ExperienceLevel
    balance: str


class AccountDeleteResponse(BaseModel):
    id: int
    deleted: bool


@router.put("/accounts/{account_id}", response_model=AccountMutationResponse)
def update_account(
    account_id: int,
    experience_level: ExperienceLevel | None = Query(default=None),
    name: str | None = Query(default=None, min_length=1, max_length=64),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountMutationResponse:
    """Update an account's experience level (resets balance) and/or name.

    Positions, orders, and transactions are not yet cleared on reset —
    that belongs to a follow-up task.
    """

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )

    if experience_level is not None:
        account.experience_level = experience_level
        account.balance = BALANCE_MAP[experience_level]
        account.reserved_balance = Decimal("0")

    if name is not None:
        account.name = name.strip()

    db.commit()
    db.refresh(account)

    return AccountMutationResponse(
        id=account.id,
        name=account.name,
        experience_level=account.experience_level,  # type: ignore[arg-type]
        balance=str(account.balance),
    )


@router.delete("/accounts/{account_id}", response_model=AccountDeleteResponse)
def delete_account(
    account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountDeleteResponse:
    """Delete a trading account. Cascades remove members, orders, holdings,
    and transactions via the Drizzle schema's ON DELETE CASCADE rules."""

    if SKIP_AUTH:
        return AccountDeleteResponse(id=account_id, deleted=True)

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )

    db.query(TradingAccount).filter(TradingAccount.id == account.id).delete()
    db.commit()

    return AccountDeleteResponse(id=account_id, deleted=True)
