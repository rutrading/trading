from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Holding


class HoldingResponse(BaseModel):
    id: int
    ticker: str
    asset_class: str
    quantity: str
    reserved_quantity: str
    average_cost: str
    created_at: str
    updated_at: str

    @classmethod
    def from_holding(cls, holding: Holding) -> "HoldingResponse":
        return cls(
            id=holding.id,
            ticker=holding.ticker,
            asset_class=holding.asset_class,
            quantity=str(holding.quantity),
            reserved_quantity=str(holding.reserved_quantity),
            average_cost=str(holding.average_cost),
            created_at=holding.created_at.isoformat(),
            updated_at=holding.updated_at.isoformat(),
        )


class HoldingsResponse(BaseModel):
    holdings: list[HoldingResponse]
    trading_account_id: int
    cash_balance: str
