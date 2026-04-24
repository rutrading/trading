from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Transaction


class TransactionResponse(BaseModel):
    id: int
    kind: str
    order_id: int | None
    ticker: str | None
    side: str | None
    quantity: str | None
    price: str | None
    total: str
    created_at: str

    @classmethod
    def from_transaction(cls, txn: Transaction) -> "TransactionResponse":
        return cls(
            id=txn.id,
            kind=txn.kind,
            order_id=txn.order_id,
            ticker=txn.ticker,
            side=txn.side,
            quantity=str(txn.quantity) if txn.quantity is not None else None,
            price=str(txn.price) if txn.price is not None else None,
            total=str(txn.total),
            created_at=txn.created_at.isoformat(),
        )


class TransactionsResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    page: int
    per_page: int
