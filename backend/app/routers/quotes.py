"""Quote endpoint with Redis hot-cache, Postgres warm-cache, and Alpaca REST fallback."""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import get_config
from app.db import Quote, db_session
from app.schemas import QuoteData, QuoteResponse
from app.services.alpaca_rest import (
    AlpacaMissingCredentials,
    AlpacaRateLimited,
    AlpacaRequestFailed,
    AlpacaTickerNotFound,
    fetch_snapshot,
)
from app.services.quote_cache import read_redis, write_redis

logger = logging.getLogger(__name__)
router = APIRouter()

QUOTE_FIELDS = tuple(QuoteData.model_fields.keys())


def _persist_quote(quote_data: QuoteData) -> None:
    """Upsert a quote into Postgres (warm cache layer)."""
    payload = quote_data.to_db_payload()
    with db_session() as db:
        existing = db.query(Quote).filter(Quote.ticker == quote_data.ticker).first()
        if existing:
            for field in QUOTE_FIELDS:
                if field != "ticker":
                    setattr(existing, field, payload.get(field))
            existing.updated_at = datetime.now(timezone.utc)
        else:
            db.add(Quote(**payload))
        db.commit()


def _read_from_postgres(ticker: str) -> QuoteData | None:
    """Try to read a quote from the Postgres warm-cache."""
    try:
        with db_session() as db:
            existing = db.query(Quote).filter(Quote.ticker == ticker).first()
            if not existing:
                return None
            return QuoteData.from_quote_row(existing)
    except Exception as exc:
        logger.warning("Postgres cache read failed for %s: %s", ticker, exc)
        return None


async def _fetch_from_alpaca(ticker: str) -> QuoteData:
    """Wrapper around the shared snapshot fetcher that maps exceptions to HTTPException."""
    try:
        return await fetch_snapshot(ticker)
    except AlpacaMissingCredentials:
        raise HTTPException(status_code=502, detail="Missing Alpaca API credentials")
    except AlpacaTickerNotFound:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found")
    except AlpacaRateLimited:
        raise HTTPException(status_code=429, detail="Alpaca rate limit exceeded")
    except AlpacaRequestFailed as exc:
        raise HTTPException(status_code=503, detail=str(exc))


async def _resolve_quote(ticker: str) -> QuoteResponse:
    """Resolve a single ticker through the Redis -> Postgres -> Alpaca chain.

    Extracted so `GET /quote` and the bulk `GET /quotes` endpoints share
    the same caching semantics. Raises HTTPException on the same failure
    classes the single endpoint always did.
    """
    config = get_config()

    cached = await read_redis(ticker)
    if cached and cached.timestamp:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - cached.timestamp
        if cache_age < config.quote_staleness_seconds:
            return QuoteResponse(
                **cached.model_dump(),
                cached=True,
                cache_layer="redis",
                age_seconds=cache_age,
            )

    pg_data = _read_from_postgres(ticker)
    if pg_data and pg_data.timestamp:
        cache_age = int(datetime.now(timezone.utc).timestamp()) - pg_data.timestamp
        if cache_age < config.quote_staleness_seconds:
            await write_redis(pg_data)
            return QuoteResponse(
                **pg_data.model_dump(),
                cached=True,
                cache_layer="postgres",
                age_seconds=cache_age,
            )

    quote_data = await _fetch_from_alpaca(ticker)
    await write_redis(quote_data)
    try:
        _persist_quote(quote_data)
    except Exception as exc:
        logger.warning("Postgres persist skipped for %s: %s", ticker, exc)

    return QuoteResponse(
        **quote_data.model_dump(),
        cached=False,
        cache_layer="alpaca_rest",
        age_seconds=0,
    )


@router.get("/quote", response_model=QuoteResponse)
async def get_quote(
    ticker: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> QuoteResponse:
    """Get a quote for a ticker. Reads Redis -> Postgres -> Alpaca REST (in that order)."""
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")
    return await _resolve_quote(ticker)


# Bulk-quotes hard cap. Above this the dashboard's single-render budget
# starts to look like a pathological client; reject so a typo'd loop can't
# fan out 10k tickers in one request.
_MAX_BULK_TICKERS = 100


class BulkQuotesResponse(BaseModel):
    """Response shape for the bulk quotes endpoint.

    `quotes` is keyed by ticker so callers don't need to do a second pass
    to align inputs and outputs. Tickers that fail individually (404, rate
    limit, transient Alpaca error) are silently omitted from the result —
    a partial response is more useful to the dashboard than a single
    failure killing every other lookup. Callers that need 1:1 strictness
    can compare `set(quotes.keys())` against the input.
    """

    quotes: dict[str, QuoteResponse]


@router.get("/quotes", response_model=BulkQuotesResponse)
async def get_quotes(
    tickers: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> BulkQuotesResponse:
    """Resolve multiple quotes in one round-trip.

    The dashboard renders 13+ holdings on first paint, each previously
    requiring its own round-trip through the Next.js server-action layer
    to `GET /quote`. This endpoint collapses that to one HTTP hop with
    `asyncio.gather` fan-out under the hood — the per-ticker resolution
    chain (Redis -> Postgres -> Alpaca) is unchanged.
    """
    raw = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not raw:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
    # Dedupe while preserving caller order so log readability isn't surprising.
    seen: set[str] = set()
    unique: list[str] = []
    for t in raw:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    if len(unique) > _MAX_BULK_TICKERS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {_MAX_BULK_TICKERS} tickers per request",
        )

    async def _safe_resolve(ticker: str) -> tuple[str, QuoteResponse | None]:
        try:
            return ticker, await _resolve_quote(ticker)
        except HTTPException as exc:
            # 404 / 429 / 502 / 503 from individual tickers shouldn't
            # cascade and fail the whole batch. Drop the ticker from the
            # result; the caller can detect omissions and fall back.
            logger.info(
                "Bulk quote: dropped %s (%d %s)", ticker, exc.status_code, exc.detail
            )
            return ticker, None

    pairs = await asyncio.gather(*(_safe_resolve(t) for t in unique))
    return BulkQuotesResponse(quotes={t: q for t, q in pairs if q is not None})
