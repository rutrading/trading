"""Watchlist endpoints: add, remove, and list tickers a user is tracking."""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.db.models import Quote, Symbol, WatchlistItem
from app.db.redis import get_redis
from app.schemas import (
    WatchlistItemResponse,
    WatchlistMutationResponse,
    WatchlistQuoteResponse,
    WatchlistResponse,
)
from app.services.alpaca_rest import (
    AlpacaMissingCredentials,
    AlpacaRateLimited,
    AlpacaRequestFailed,
    AlpacaTickerNotFound,
    QuoteData,
    fetch_snapshot,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _quote_to_watchlist(quote: QuoteData, source: str) -> WatchlistQuoteResponse:
    return WatchlistQuoteResponse(
        price=quote.price,
        change=quote.change,
        change_percent=quote.change_percent,
        bid_price=quote.bid_price,
        ask_price=quote.ask_price,
        timestamp=quote.timestamp,
        source=source,
    )


def _persist_snapshot(db: Session, quote: QuoteData) -> None:
    """Upsert a freshly-fetched snapshot into Postgres so the next watchlist
    load hits the warm cache instead of Alpaca REST again."""
    payload = quote.to_db_payload()
    existing = db.query(Quote).filter(Quote.ticker == quote.ticker).first()
    if existing:
        for field, value in payload.items():
            if field != "ticker":
                setattr(existing, field, value)
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(Quote(**payload))
    db.commit()


async def _fetch_alpaca_snapshots(
    db: Session, tickers: list[str]
) -> dict[str, WatchlistQuoteResponse]:
    """Fetch snapshots for every ticker that missed both caches.

    Runs the REST calls in parallel and persists each result to Postgres so
    subsequent watchlist loads hit the warm cache. Errors per ticker are
    swallowed — we'd rather render an em-dash than fail the whole endpoint.
    """
    if not tickers:
        return {}

    async def _one(ticker: str) -> tuple[str, QuoteData | None]:
        try:
            return ticker, await fetch_snapshot(ticker)
        except (
            AlpacaMissingCredentials,
            AlpacaTickerNotFound,
            AlpacaRateLimited,
            AlpacaRequestFailed,
        ) as exc:
            logger.warning("Watchlist snapshot failed for %s: %s", ticker, exc)
            return ticker, None

    results = await asyncio.gather(*(_one(t) for t in tickers))
    out: dict[str, WatchlistQuoteResponse] = {}
    for ticker, quote in results:
        if quote is None:
            continue
        out[ticker] = _quote_to_watchlist(quote, source="alpaca_rest")
        try:
            _persist_snapshot(db, quote)
        except Exception as exc:
            logger.warning("Watchlist persist skipped for %s: %s", ticker, exc)
    return out


async def _get_quote_from_redis(redis, ticker: str) -> WatchlistQuoteResponse | None:
    data = await redis.hgetall(f"quote:{ticker}")
    if not data:
        return None

    return WatchlistQuoteResponse.from_redis_hash(data)


def _get_quotes_from_postgres(
    db: Session, tickers: list[str]
) -> dict[str, WatchlistQuoteResponse]:
    """Batch-load quotes from the warm Postgres cache.

    Used as the fallback for tickers that aren't in Redis — otherwise a
    watchlist entry on a ticker no live client is subscribed to renders as
    blank dashes even though Postgres has a usable (if stale) snapshot.
    """
    if not tickers:
        return {}
    rows = db.query(Quote).filter(Quote.ticker.in_(tickers)).all()
    out: dict[str, WatchlistQuoteResponse] = {}
    for row in rows:
        out[row.ticker] = WatchlistQuoteResponse(
            price=row.price,
            change=row.change,
            change_percent=row.change_percent,
            bid_price=row.bid_price,
            ask_price=row.ask_price,
            timestamp=row.timestamp,
            source="postgres",
        )
    return out


@router.get("/watchlist", response_model=WatchlistResponse)
async def list_watchlist(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchlistResponse:
    user_id = user["sub"]
    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user_id)
        .order_by(WatchlistItem.created_at.desc())
        .all()
    )

    redis = await get_redis()
    quotes: dict[str, WatchlistQuoteResponse] = {}
    redis_misses: list[str] = []
    for item in items:
        quote = await _get_quote_from_redis(redis, item.ticker)
        if quote is not None:
            quotes[item.ticker] = quote
        else:
            redis_misses.append(item.ticker)

    postgres_hits: dict[str, WatchlistQuoteResponse] = {}
    if redis_misses:
        postgres_hits = _get_quotes_from_postgres(db, redis_misses)
        quotes.update(postgres_hits)

    # Any ticker still missing has never been quoted (e.g. freshly-watched
    # stock off-hours with no live subscribers). Fall back to an Alpaca REST
    # snapshot so the table doesn't show dashes forever.
    still_missing = [t for t in redis_misses if t not in postgres_hits]
    if still_missing:
        quotes.update(await _fetch_alpaca_snapshots(db, still_missing))

    result = [
        WatchlistItemResponse.from_values(
            ticker=item.ticker,
            created_at=item.created_at,
            quote=quotes.get(item.ticker),
        )
        for item in items
    ]

    return WatchlistResponse(watchlist=result)


@router.post("/watchlist", response_model=WatchlistMutationResponse)
def add_to_watchlist(
    ticker: str = Query(..., min_length=1, max_length=16),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchlistMutationResponse:
    ticker = ticker.upper().strip()

    user_id = user["sub"]

    symbol = db.query(Symbol).filter(Symbol.ticker == ticker).first()
    if not symbol:
        raise HTTPException(status_code=404, detail=f"{ticker} not found")

    existing = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user_id, WatchlistItem.ticker == ticker)
        .first()
    )
    if existing:
        return WatchlistMutationResponse(ticker=ticker, added=False)

    db.add(WatchlistItem(user_id=user_id, ticker=ticker))
    db.commit()
    return WatchlistMutationResponse(ticker=ticker, added=True)


@router.delete("/watchlist/{ticker}", response_model=WatchlistMutationResponse)
def remove_from_watchlist(
    ticker: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WatchlistMutationResponse:
    ticker = ticker.upper().strip()

    user_id = user["sub"]

    item = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user_id, WatchlistItem.ticker == ticker)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"{ticker} not on watchlist")

    db.delete(item)
    db.commit()
    return WatchlistMutationResponse(ticker=ticker, removed=True)
