"""Historical bars endpoints."""

from datetime import datetime

import grpc
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.grpc_client import get_pipeline_client

router = APIRouter()

ALLOWED_TIMEFRAMES = {"1Min", "30Min", "1Hour", "1Day", "1Month"}


class HistoricalBarsRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    timeframe: str
    start: str
    end: str

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not symbol:
            raise ValueError("symbol is required")
        return symbol

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, value: str) -> str:
        tf = value.strip()
        if tf not in ALLOWED_TIMEFRAMES:
            raise ValueError(
                f"timeframe must be one of: {', '.join(sorted(ALLOWED_TIMEFRAMES))}"
            )
        return tf

    @field_validator("start", "end")
    @classmethod
    def validate_datetime(cls, value: str) -> str:
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("must be a valid ISO-8601 datetime")
        return value


@router.post("/historical-bars")
async def get_historical_bars(
    payload: HistoricalBarsRequest,
    pipeline=Depends(get_pipeline_client),
):
    start_dt = datetime.fromisoformat(payload.start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(payload.end.replace("Z", "+00:00"))
    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="start must be before end")

    try:
        response = await pipeline.fetch_historical_bars(
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            start=payload.start,
            end=payload.end,
        )
    except grpc.aio.AioRpcError as e:
        status = e.code()
        detail = e.details() or "Unknown gRPC error"
        if status == grpc.StatusCode.INVALID_ARGUMENT:
            raise HTTPException(status_code=400, detail=detail)
        if status == grpc.StatusCode.UNAUTHENTICATED:
            raise HTTPException(status_code=502, detail=detail)
        if status == grpc.StatusCode.NOT_FOUND:
            raise HTTPException(status_code=404, detail=detail)
        if status == grpc.StatusCode.UNAVAILABLE:
            raise HTTPException(status_code=503, detail=detail)
        raise HTTPException(status_code=502, detail=detail)

    return {
        "symbol": response.symbol,
        "timeframe": response.timeframe,
        "source": response.source,
        "bars": [
            {
                "time": bar.timestamp,
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
                "vwap": bar.vwap,
                "trade_count": bar.trade_count,
            }
            for bar in response.bars
        ],
    }
