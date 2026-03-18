from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Quote


def _to_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


class QuoteData(BaseModel):
    ticker: str
    price: float | None = None
    bid_price: float | None = None
    bid_size: float | None = None
    ask_price: float | None = None
    ask_size: float | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: float | None = None
    trade_count: int | None = None
    vwap: float | None = None
    previous_close: float | None = None
    change: float | None = None
    change_percent: float | None = None
    source: str | None = None
    timestamp: int | None = None

    @classmethod
    def from_redis_hash(cls, ticker: str, data: dict[str, str]) -> "QuoteData":
        return cls(
            ticker=ticker,
            price=_to_float(data.get("price")),
            bid_price=_to_float(data.get("bid_price")),
            bid_size=_to_float(data.get("bid_size")),
            ask_price=_to_float(data.get("ask_price")),
            ask_size=_to_float(data.get("ask_size")),
            open=_to_float(data.get("open")),
            high=_to_float(data.get("high")),
            low=_to_float(data.get("low")),
            close=_to_float(data.get("close")),
            volume=_to_float(data.get("volume")),
            trade_count=_to_int(data.get("trade_count")),
            vwap=_to_float(data.get("vwap")),
            previous_close=_to_float(data.get("previous_close")),
            change=_to_float(data.get("change")),
            change_percent=_to_float(data.get("change_percent")),
            source=data.get("source"),
            timestamp=_to_int(data.get("timestamp")),
        )

    @classmethod
    def from_quote_row(cls, row: Quote) -> "QuoteData":
        return cls(
            ticker=row.ticker,
            price=row.price,
            bid_price=row.bid_price,
            bid_size=row.bid_size,
            ask_price=row.ask_price,
            ask_size=row.ask_size,
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
            trade_count=row.trade_count,
            vwap=row.vwap,
            previous_close=row.previous_close,
            change=row.change,
            change_percent=row.change_percent,
            source=row.source,
            timestamp=row.timestamp,
        )

    def to_redis_mapping(self) -> dict[str, str]:
        return {
            key: str(value)
            for key, value in self.model_dump().items()
            if value is not None and key != "ticker"
        }

    def to_db_payload(self) -> dict:
        return self.model_dump()


class QuoteResponse(QuoteData):
    cached: bool
    cache_layer: str
    age_seconds: int
