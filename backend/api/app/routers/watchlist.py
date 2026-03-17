"""Watchlist endpoints: add, remove, and list tickers a user is tracking."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.db.models import Symbol, WatchlistItem
from app.db.redis import get_redis

router = APIRouter()


async def _get_quote_from_redis(redis, ticker: str) -> dict | None:
    data = await redis.hgetall(f"quote:{ticker}")
    if not data:
        return None

    def _f(key: str) -> float | None:
        v = data.get(key)
        return float(v) if v else None

    def _i(key: str) -> int | None:
        v = data.get(key)
        return int(float(v)) if v else None

    return {
        "price": _f("price"),
        "change": _f("change"),
        "change_percent": _f("change_percent"),
        "bid_price": _f("bid_price"),
        "ask_price": _f("ask_price"),
        "timestamp": _i("timestamp"),
        "source": data.get("source"),
    }


@router.get("/watchlist")
async def list_watchlist(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = user["sub"]
    items = (
        db.query(WatchlistItem)
        .filter(WatchlistItem.user_id == user_id)
        .order_by(WatchlistItem.created_at.desc())
        .all()
    )

    redis = await get_redis()
    result = []
    for item in items:
        quote = await _get_quote_from_redis(redis, item.ticker)
        result.append(
            {
                "ticker": item.ticker,
                "created_at": item.created_at.isoformat(),
                "quote": quote,
            }
        )

    return {"watchlist": result}


@router.post("/watchlist")
def add_to_watchlist(
    ticker: str = Query(..., min_length=1, max_length=16),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
        return {"ticker": ticker, "added": False}

    db.add(WatchlistItem(user_id=user_id, ticker=ticker))
    db.commit()
    return {"ticker": ticker, "added": True}


@router.delete("/watchlist/{ticker}")
def remove_from_watchlist(
    ticker: str,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
    return {"ticker": ticker, "removed": True}
