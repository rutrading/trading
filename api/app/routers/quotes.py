"""Quote endpoints that trigger the gRPC pipeline on cache miss."""

import logging
from datetime import datetime, timezone

import grpc
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.grpc_client import get_pipeline_client

logger = logging.getLogger(__name__)

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
    try:
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
                        "name": existing.name,
                        "exchange": existing.exchange,
                        "currency": existing.currency,
                        "price": existing.price,
                        "open": existing.open,
                        "high": existing.high,
                        "low": existing.low,
                        "volume": existing.volume,
                        "change": existing.change,
                        "change_percent": existing.change_percent,
                        "previous_close": existing.previous_close,
                        "is_market_open": existing.is_market_open,
                        "average_volume": existing.average_volume,
                        "fifty_two_week_low": existing.fifty_two_week_low,
                        "fifty_two_week_high": existing.fifty_two_week_high,
                        "day_range_pct": existing.day_range_pct,
                        "fifty_two_week_pct": existing.fifty_two_week_pct,
                        "gap_pct": existing.gap_pct,
                        "volume_ratio": existing.volume_ratio,
                        "intraday_range_pct": existing.intraday_range_pct,
                        "signal": existing.signal,
                        "timestamp": existing.timestamp,
                        "cached": True,
                        "age_seconds": round(age, 1),
                    }
        finally:
            db.close()
    except Exception as e:
        logger.warning("DB check failed, falling through to pipeline: %s", e)

    # Cache miss: trigger gRPC pipeline
    try:
        result = await pipeline.fetch_quote(symbol)
    except grpc.aio.AioRpcError as e:
        status = e.code()
        detail = e.details() or "Unknown gRPC error"
        if status == grpc.StatusCode.UNAVAILABLE:
            raise HTTPException(
                status_code=503, detail="gRPC services are unavailable."
            )
        elif status == grpc.StatusCode.UNAUTHENTICATED:
            raise HTTPException(status_code=502, detail=detail)
        elif status == grpc.StatusCode.NOT_FOUND:
            raise HTTPException(status_code=404, detail=detail)
        else:
            raise HTTPException(status_code=502, detail=detail)
    except Exception:
        raise HTTPException(status_code=503, detail="gRPC services are unavailable.")

    return {
        "symbol": result.symbol,
        "name": result.name,
        "exchange": result.exchange,
        "currency": result.currency,
        "price": result.price,
        "open": result.open,
        "high": result.high,
        "low": result.low,
        "volume": result.volume,
        "change": result.change,
        "change_percent": result.change_percent,
        "previous_close": result.previous_close,
        "is_market_open": result.is_market_open,
        "average_volume": result.average_volume,
        "fifty_two_week_low": result.fifty_two_week_low,
        "fifty_two_week_high": result.fifty_two_week_high,
        "day_range_pct": result.day_range_pct,
        "fifty_two_week_pct": result.fifty_two_week_pct,
        "gap_pct": result.gap_pct,
        "volume_ratio": result.volume_ratio,
        "intraday_range_pct": result.intraday_range_pct,
        "signal": result.signal,
        "timestamp": result.timestamp,
        "cached": False,
    }
