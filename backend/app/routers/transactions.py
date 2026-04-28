"""Transaction history endpoint: paginated list of fills for a trading account."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import Transaction, get_db
from app.dependencies import get_trading_account
from app.schemas import TransactionResponse, TransactionsResponse

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

    account = get_trading_account(
        trading_account_id=trading_account_id, user=user, db=db
    )

    # Mirror /api/holdings: a stale dashboard fan-out may include kalshi ids;
    # transactions for kalshi flows live in kalshi_fill, not `transaction`.
    if account.type == "kalshi":
        return TransactionsResponse(
            transactions=[], total=0, page=page, per_page=per_page,
        )

    query = db.query(Transaction).filter(
        Transaction.trading_account_id == trading_account_id
    )

    ticker_filter = ticker.upper().strip() if ticker else None
    if ticker_filter:
        query = query.filter(Transaction.ticker == ticker_filter)

    total = query.count()
    transactions = (
        query.order_by(Transaction.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return TransactionsResponse(
        transactions=[
            TransactionResponse.from_transaction(transaction)
            for transaction in transactions
        ],
        total=total,
        page=page,
        per_page=per_page,
    )
