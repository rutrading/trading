"""Quote endpoints that trigger the data pipeline on cache miss."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from trading_lib.pipeline import PipelineError
from trading_lib.utils import is_quote_fresh, quote_to_dict

from app.auth import get_current_user
from app.pipeline_client import get_pipeline_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/quote")
async def get_quote(
    symbol: str,
    user: dict = Depends(get_current_user),
    pipeline=Depends(get_pipeline_client),
):
    """Get a stock quote. Returns cached data if fresh, otherwise fetches and stores a new quote."""
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
            if (
                existing
                and existing.updated_at
                and is_quote_fresh(
                    existing.updated_at,
                    pipeline.config.quote_staleness_seconds,
                )
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

    # Cache miss: run pipeline
    try:
        result = await pipeline.fetch_quote(symbol)
    except PipelineError as e:
        if e.code == "not_found":
            raise HTTPException(status_code=404, detail=str(e))
        if e.code == "bad_request":
            raise HTTPException(status_code=400, detail=str(e))
        if e.code == "unauthorized":
            raise HTTPException(status_code=502, detail=str(e))
        if e.code in ("unavailable", "upstream_error"):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Pipeline failed for %s: %s", symbol, e)
        raise HTTPException(status_code=503, detail=f"Pipeline error: {e}")

    return quote_to_dict(result, cached=False)
