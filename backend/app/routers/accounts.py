"""Trading account mutations: rename, reset balance, delete."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import TradingAccount, get_db
from app.dependencies import get_trading_account
from app.experience import BALANCE_MAP, EXPERIENCE_OPTIONS, ExperienceLevel

router = APIRouter()


class ExperienceLevelResponse(BaseModel):
    value: ExperienceLevel
    label: str
    balance: str
    starting_balance: str
    description: str


@router.get(
    "/accounts/experience-levels",
    response_model=list[ExperienceLevelResponse],
)
def list_experience_levels() -> list[ExperienceLevelResponse]:
    """Return the experience levels and their starting balances. The web
    and the server share this list so labels and amounts stay in sync."""

    return [ExperienceLevelResponse(**o.to_dict()) for o in EXPERIENCE_OPTIONS]


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
    """Update an account's name and/or experience level.

    Changing the experience level resets the available cash to the level's
    starting balance while preserving cash already reserved by open orders,
    so outstanding orders and holdings are untouched.
    """

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )

    if name is not None:
        account.name = name.strip()

    if experience_level is not None:
        account.experience_level = experience_level
        # Available cash = balance - reserved_balance. We want available to
        # equal the level's starting balance, so set balance = starting +
        # reserved. Open orders keep their reservation; holdings stay.
        account.balance = BALANCE_MAP[experience_level] + account.reserved_balance

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

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )

    db.query(TradingAccount).filter(TradingAccount.id == account.id).delete()
    db.commit()

    return AccountDeleteResponse(id=account_id, deleted=True)
