"""Transaction history endpoint: paginated list of fills for a trading account."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Transaction, get_db
from app.dependencies import get_trading_account

router = APIRouter()


@router.get("/transactions")
def list_transactions(
    trading_account_id: int,
    ticker: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List transaction history for a trading account with optional ticker filter."""

    get_trading_account(trading_account_id=trading_account_id, user=user, db=db)

    query = db.query(Transaction).filter(
        Transaction.trading_account_id == trading_account_id
    )

    # optionally filter by ticker
    if ticker:
        query = query.filter(Transaction.ticker == ticker.upper().strip())

    total = query.count()
    transactions = (
        query.order_by(Transaction.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "transactions": [
            {
                "id": t.id,
                "order_id": t.order_id,
                "ticker": t.ticker,
                "side": t.side,
                "quantity": str(t.quantity),
                "price": str(t.price),
                "total": str(t.total),
                "created_at": t.created_at.isoformat(),
            }
            for t in transactions
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
