"""Holdings endpoint: list current positions for a trading account."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Holding, get_db
from app.db.models import Symbol
from app.dependencies import get_trading_account
from app.schemas import HoldingResponse, HoldingsResponse

router = APIRouter()


@router.get("/holdings")
def list_holdings(
    trading_account_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all holdings for a trading account."""

    account = get_trading_account(
        trading_account_id=trading_account_id, user=user, db=db
    )

    # Outer join so a holding on an unseeded ticker still comes back (name=None).
    rows = (
        db.query(Holding, Symbol.name)
        .outerjoin(Symbol, Symbol.ticker == Holding.ticker)
        .filter(Holding.trading_account_id == account.id)
        .order_by(Holding.ticker)
        .all()
    )

    return HoldingsResponse(
        holdings=[HoldingResponse.from_holding(holding, name=name) for holding, name in rows],
        trading_account_id=account.id,
        cash_balance=str(account.balance),
    )
