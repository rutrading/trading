"""Quote endpoints that trigger the gRPC pipeline on cache miss."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.grpc_client import get_pipeline_client

router = APIRouter()


@router.get("/quote")
async def get_quote(
    symbol: str,
    user: dict = Depends(get_current_user),
    pipeline=Depends(get_pipeline_client),
):
    """Get a stock quote. Returns cached data if <60s old, otherwise triggers
    the full gRPC pipeline: MarketData -> Transformer -> Filter -> DB."""
    symbol = symbol.upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    # Check DB for fresh quote
    from trading_lib.db import get_db
    from trading_lib.models import Quote

    db = next(get_db())
    try:
        existing = db.query(Quote).filter(Quote.symbol == symbol).first()
        if existing and existing.updated_at:
            age = (
                datetime.now(timezone.utc)
                - existing.updated_at.replace(tzinfo=timezone.utc)
            ).total_seconds()
            if age < pipeline.config.quote_staleness_seconds:
                return {
                    "symbol": existing.symbol,
                    "price": existing.price,
                    "open": existing.open,
                    "high": existing.high,
                    "low": existing.low,
                    "volume": existing.volume,
                    "change": existing.change,
                    "change_percent": existing.change_percent,
                    "timestamp": existing.timestamp,
                    "cached": True,
                    "age_seconds": round(age, 1),
                }
    finally:
        db.close()

    # Cache miss: trigger gRPC pipeline
    result = await pipeline.fetch_quote(symbol)
    if result is None:
        raise HTTPException(status_code=502, detail="Pipeline failed to fetch quote")

    return {
        "symbol": result.symbol,
        "price": result.price,
        "open": result.open,
        "high": result.high,
        "low": result.low,
        "volume": result.volume,
        "change": result.change,
        "change_percent": result.change_percent,
        "timestamp": result.timestamp,
        "cached": False,
    }
