from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class WatchlistQuoteResponse(BaseModel):
    price: float | None
    change: float | None
    change_percent: float | None
    bid_price: float | None
    ask_price: float | None
    timestamp: int | None
    source: str | None

    @classmethod
    def from_redis_hash(cls, data: dict[str, str]) -> "WatchlistQuoteResponse":
        def to_float(value: str | None) -> float | None:
            if value in (None, ""):
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        def to_int(value: str | None) -> int | None:
            if value in (None, ""):
                return None
            try:
                return int(float(value))
            except (TypeError, ValueError):
                return None

        return cls(
            price=to_float(data.get("price")),
            change=to_float(data.get("change")),
            change_percent=to_float(data.get("change_percent")),
            bid_price=to_float(data.get("bid_price")),
            ask_price=to_float(data.get("ask_price")),
            timestamp=to_int(data.get("timestamp")),
            source=data.get("source"),
        )


class WatchlistItemResponse(BaseModel):
    ticker: str
    created_at: str
    quote: WatchlistQuoteResponse | None

    @classmethod
    def from_values(
        cls,
        *,
        ticker: str,
        created_at: datetime,
        quote: WatchlistQuoteResponse | None,
    ) -> "WatchlistItemResponse":
        return cls(
            ticker=ticker,
            created_at=created_at.isoformat(),
            quote=quote,
        )


class WatchlistResponse(BaseModel):
    watchlist: list[WatchlistItemResponse]


class WatchlistMutationResponse(BaseModel):
    ticker: str
    added: bool | None = None
    removed: bool | None = None
