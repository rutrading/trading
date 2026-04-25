"""Trading account mutations: rename, reset, deposit cash, delete."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Holding, Order, TradingAccount, Transaction, get_db
from app.dependencies import get_trading_account
from app.experience import BALANCE_MAP, EXPERIENCE_OPTIONS, ExperienceLevel
from app.services.transactions import create_deposit

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


def _account_response(account: TradingAccount) -> AccountMutationResponse:
    return AccountMutationResponse(
        id=account.id,
        name=account.name,
        experience_level=account.experience_level,  # type: ignore[arg-type]
        balance=str(account.balance),
    )


@router.put("/accounts/{account_id}", response_model=AccountMutationResponse)
def update_account(
    account_id: int,
    name: str = Query(..., min_length=1, max_length=64),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountMutationResponse:
    """Rename an account."""

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )
    account.name = name.strip()

    db.commit()
    db.refresh(account)

    return _account_response(account)


class ResetAccountRequest(BaseModel):
    experience_level: ExperienceLevel


@router.post("/accounts/{account_id}/reset", response_model=AccountMutationResponse)
def reset_account(
    account_id: int,
    body: ResetAccountRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountMutationResponse:
    """Wipe transactions/holdings/orders and reseed with a single deposit.

    Locks the account row to serialize against the order executor; see
    ``app/services/trading.py`` for the lock-ordering convention.
    """

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )
    db.refresh(account, with_for_update=True)

    db.query(Transaction).filter(Transaction.trading_account_id == account.id).delete(
        synchronize_session=False
    )
    db.query(Order).filter(Order.trading_account_id == account.id).delete(
        synchronize_session=False
    )
    db.query(Holding).filter(Holding.trading_account_id == account.id).delete(
        synchronize_session=False
    )

    account.experience_level = body.experience_level
    account.balance = Decimal("0")
    account.reserved_balance = Decimal("0")
    create_deposit(db, account, BALANCE_MAP[body.experience_level])

    db.commit()
    db.refresh(account)

    return _account_response(account)


class DepositRequest(BaseModel):
    amount: Decimal = Field(gt=Decimal("0"))


@router.post("/accounts/{account_id}/deposits", response_model=AccountMutationResponse)
def create_account_deposit(
    account_id: int,
    body: DepositRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountMutationResponse:
    """Add a deposit transaction and increment cash balance.

    Backend enforces ``amount > 0``; any "minimum deposit" floor is a UX
    rule enforced client-side. Account-creation seed deposits also flow
    through here, so the floor must stay at 0 server-side.
    """

    account = get_trading_account(
        trading_account_id=account_id, user=user, db=db
    )
    db.refresh(account, with_for_update=True)
    create_deposit(db, account, body.amount)
    db.commit()
    db.refresh(account)

    return _account_response(account)


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
