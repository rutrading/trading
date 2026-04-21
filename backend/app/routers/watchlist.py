"""Watchlist endpoints: add, remove, and list tickers a user is tracking."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import SKIP_AUTH, get_current_user
from app.db import get_db
from app.db.models import Quote, Symbol, WatchlistItem
from app.db.redis import get_redis
from app.schemas import (
    WatchlistItemResponse,
    WatchlistMutationResponse,
    WatchlistQuoteResponse,
    WatchlistResponse,
)

router = APIRouter()


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
    if SKIP_AUTH:
        return WatchlistResponse(watchlist=[])

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

    if redis_misses:
        quotes.update(_get_quotes_from_postgres(db, redis_misses))

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

    if SKIP_AUTH:
        return WatchlistMutationResponse(ticker=ticker, added=True)

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

    if SKIP_AUTH:
        return WatchlistMutationResponse(ticker=ticker, removed=True)

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
