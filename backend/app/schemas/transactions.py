from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Transaction


class TransactionResponse(BaseModel):
    id: int
    order_id: int
    ticker: str
    side: str
    quantity: str
    price: str
    total: str
    created_at: str

    @classmethod
    def from_transaction(cls, txn: Transaction) -> "TransactionResponse":
        return cls(
            id=txn.id,
            order_id=txn.order_id,
            ticker=txn.ticker,
            side=txn.side,
            quantity=str(txn.quantity),
            price=str(txn.price),
            total=str(txn.total),
            created_at=txn.created_at.isoformat(),
        )


class TransactionsResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    page: int
    per_page: int
