"""Quote endpoints that trigger the gRPC pipeline on cache miss."""

import logging
from datetime import datetime, timezone

import grpc
from fastapi import APIRouter, Depends, HTTPException

from trading_lib.utils import is_quote_fresh, quote_to_dict

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
    """Get a stock quote. Returns cached data if fresh, otherwise triggers
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
            if existing and is_quote_fresh(
                existing.updated_at,
                pipeline.config.quote_staleness_seconds,
            ):
                age = (
                    datetime.now(timezone.utc)
                    - existing.updated_at.replace(tzinfo=timezone.utc)
                ).total_seconds()
                return quote_to_dict(existing, cached=True, age_seconds=round(age, 1))
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

    return quote_to_dict(result, cached=False)
