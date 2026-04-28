"""Quote endpoint thin wrappers — the resolution chain itself lives in
`app/services/quote_cache.py` so the order-placement path can reuse it."""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.auth import get_current_user
from app.schemas import QuoteResponse
from app.services.quote_cache import resolve_quote

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/quote", response_model=QuoteResponse)
async def get_quote(
    ticker: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> QuoteResponse:
    """Get a quote for a ticker. Reads Redis -> Postgres -> Alpaca REST (in that order)."""
    ticker = ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required")
    return await resolve_quote(ticker)


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


class QuoteabilityItem(BaseModel):
    quoteable: bool
    reason: str | None = None


class QuoteabilityResponse(BaseModel):
    symbols: dict[str, QuoteabilityItem]


@router.get("/quotes", response_model=BulkQuotesResponse)
async def get_quotes(
    tickers: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> BulkQuotesResponse:
    """Resolve multiple quotes in one round-trip via `asyncio.gather`."""
    raw = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not raw:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
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
            return ticker, await resolve_quote(ticker)
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


@router.get("/quoteability", response_model=QuoteabilityResponse)
async def get_quoteability(
    tickers: str = Query(..., min_length=1),
    user: dict = Depends(get_current_user),
) -> QuoteabilityResponse:
    """Check whether symbols can currently be priced by the app's Alpaca feed.

    This is intentionally softer than `/quote`: each symbol gets its own result
    so trade search can filter unpriceable symbols like unsupported crypto pairs
    without turning one Alpaca 401/404 into a failed whole request.
    """
    raw = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not raw:
        raise HTTPException(status_code=400, detail="At least one ticker is required")
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

    async def _check(ticker: str) -> tuple[str, QuoteabilityItem]:
        try:
            quote = await resolve_quote(ticker)
            if quote.price is None and quote.bid_price is None and quote.ask_price is None:
                return ticker, QuoteabilityItem(
                    quoteable=False,
                    reason="No price data available",
                )
            return ticker, QuoteabilityItem(quoteable=True)
        except HTTPException as exc:
            logger.info(
                "Quoteability: %s unavailable (%d %s)",
                ticker,
                exc.status_code,
                exc.detail,
            )
            return ticker, QuoteabilityItem(
                quoteable=False,
                reason=str(exc.detail),
            )

    pairs = await asyncio.gather(*(_check(t) for t in unique))
    return QuoteabilityResponse(symbols=dict(pairs))
