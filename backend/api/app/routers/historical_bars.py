"""Historical bars endpoint: GET with routing by timeframe.

Intraday (< 1Day) -> Alpaca REST on demand, not stored.
Daily (1Day)      -> daily_bar table + Alpaca backfill for gaps.
Aggregated        -> SQL aggregation over daily_bar (1Week, 1Month, 3Month).
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.services.bars import (
    AGGREGATED_TIMEFRAMES,
    DAILY_TIMEFRAME,
    INTRADAY_TIMEFRAMES,
    fetch_aggregated_bars,
    fetch_daily_bars,
    fetch_intraday_bars,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALL_TIMEFRAMES = INTRADAY_TIMEFRAMES | {DAILY_TIMEFRAME} | AGGREGATED_TIMEFRAMES


def _parse_iso_utc(value: str) -> datetime:
    if not value:
        raise ValueError("missing ISO datetime")
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.get("/historical-bars")
async def get_historical_bars(
    ticker: str = Query(..., min_length=1, max_length=16),
    timeframe: str = Query(...),
    start: str = Query(...),
    end: str = Query(None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch historical bars for a ticker, routed by timeframe."""
    ticker = ticker.strip().upper()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")

    # validate timeframe against known set
    if timeframe not in ALL_TIMEFRAMES:
        raise HTTPException(
            status_code=400,
            detail=f"Timeframe must be one of: {', '.join(sorted(ALL_TIMEFRAMES))}",
        )

    # default end to current UTC time if not provided
    if not end:
        end = datetime.now(timezone.utc).isoformat()

    # validate date range
    try:
        start_dt = _parse_iso_utc(start)
        end_dt = _parse_iso_utc(end)
    except ValueError:
        raise HTTPException(
            status_code=400, detail="start and end must be valid ISO-8601 datetimes"
        )

    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="start must be before end")

    try:
        if timeframe in INTRADAY_TIMEFRAMES:
            # intraday: fetch from Alpaca REST, never stored
            bars = await fetch_intraday_bars(ticker, timeframe, start, end)
            source = "alpaca"

        elif timeframe == DAILY_TIMEFRAME:
            # daily: DB + Alpaca backfill for gaps
            bars = await fetch_daily_bars(db, ticker, start, end)
            source = "daily_bar"

        else:
            # weekly / monthly / quarterly: aggregate from daily_bar
            bars = await fetch_aggregated_bars(db, ticker, timeframe, start, end)
            source = "aggregated"

    except Exception as exc:
        logger.exception("Failed to fetch bars for %s: %s", ticker, exc)
        raise HTTPException(
            status_code=503, detail=f"Failed to fetch historical bars: {exc}"
        )

    return {
        "ticker": ticker,
        "timeframe": timeframe,
        "source": source,
        "bars": bars,
    }
