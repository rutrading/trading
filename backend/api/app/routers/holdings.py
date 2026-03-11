"""Holdings endpoint: list current positions for a trading account."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Holding, get_db
from app.dependencies import get_trading_account

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

    holdings = (
        db.query(Holding)
        .filter(Holding.trading_account_id == account.id)
        .order_by(Holding.symbol)
        .all()
    )

    return {
        "holdings": [
            {
                "id": h.id,
                "symbol": h.symbol,
                "asset_type": h.asset_type,
                "quantity": str(h.quantity),
                "average_cost": str(h.average_cost),
                "created_at": h.created_at.isoformat(),
                "updated_at": h.updated_at.isoformat(),
            }
            for h in holdings
        ],
        "trading_account_id": account.id,
        "cash_balance": str(account.balance),
    }
