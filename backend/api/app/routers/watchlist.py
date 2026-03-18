"""Watchlist endpoints: add, remove, and list tickers a user is tracking."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.db.models import Symbol, WatchlistItem
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
    result: list[WatchlistItemResponse] = []
    for item in items:
        quote = await _get_quote_from_redis(redis, item.ticker)
        result.append(
            WatchlistItemResponse.from_values(
                ticker=item.ticker,
                created_at=item.created_at,
                quote=quote,
            )
        )

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
