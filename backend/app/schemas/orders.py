from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Order, Transaction


class OrderResponse(BaseModel):
    id: int
    trading_account_id: int
    ticker: str
    asset_class: str
    side: str
    order_type: str
    time_in_force: str
    quantity: str
    limit_price: str | None
    stop_price: str | None
    filled_quantity: str
    average_fill_price: str | None
    status: str
    rejection_reason: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_order(cls, order: Order) -> "OrderResponse":
        return cls(
            id=order.id,
            trading_account_id=order.trading_account_id,
            ticker=order.ticker,
            asset_class=order.asset_class,
            side=order.side,
            order_type=order.order_type,
            time_in_force=order.time_in_force,
            quantity=str(order.quantity),
            limit_price=str(order.limit_price)
            if order.limit_price is not None
            else None,
            stop_price=str(order.stop_price) if order.stop_price is not None else None,
            filled_quantity=str(order.filled_quantity),
            average_fill_price=str(order.average_fill_price)
            if order.average_fill_price is not None
            else None,
            status=order.status,
            rejection_reason=order.rejection_reason,
            created_at=order.created_at.isoformat(),
            updated_at=order.updated_at.isoformat(),
        )


class OrderTransactionResponse(BaseModel):
    id: int
    quantity: str
    price: str
    total: str
    side: str
    created_at: str

    @classmethod
    def from_transaction(cls, txn: Transaction) -> "OrderTransactionResponse":
        return cls(
            id=txn.id,
            quantity=str(txn.quantity),
            price=str(txn.price),
            total=str(txn.total),
            side=txn.side,
            created_at=txn.created_at.isoformat(),
        )


class OrderDetailResponse(OrderResponse):
    transactions: list[OrderTransactionResponse]


class OrdersPageResponse(BaseModel):
    orders: list[OrderResponse]
    total: int
    page: int
    per_page: int
