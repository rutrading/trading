"""Symbol endpoints: search, lookup, seed from Alpaca."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_

from app.config import get_config
from app.db import db_session
from app.db.models import Symbol
from app.rate_limit import RateLimiter

logger = logging.getLogger(__name__)
router = APIRouter()

ALPACA_TRADING_BASE = "https://api.alpaca.markets"

_rate_limiter: RateLimiter | None = None
_rate_limit_value: int | None = None


def _get_rate_limiter(calls_per_minute: int) -> RateLimiter:
    global _rate_limiter, _rate_limit_value
    if _rate_limiter is None or _rate_limit_value != calls_per_minute:
        _rate_limiter = RateLimiter(calls_per_minute)
        _rate_limit_value = calls_per_minute
    return _rate_limiter


def _alpaca_headers() -> dict[str, str]:
    config = get_config()
    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise HTTPException(status_code=500, detail="Alpaca API keys not configured")
    return {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }


def _symbol_to_dict(s: Symbol) -> dict:
    return {
        "ticker": s.ticker,
        "name": s.name,
        "exchange": s.exchange,
        "asset_class": s.asset_class,
        "tradable": s.tradable,
        "fractionable": s.fractionable,
    }


@router.get("/symbols/search")
async def search_symbols(q: str = Query(..., min_length=1)):
    """Search local symbol table by ticker prefix or name substring."""
    q = q.strip().upper()
    with db_session() as db:
        results = (
            db.query(Symbol)
            .filter(
                Symbol.tradable == True,
                or_(
                    Symbol.ticker.ilike(f"{q}%"),
                    Symbol.name.ilike(f"%{q}%"),
                ),
            )
            .order_by(
                # exact match first, then prefix, then name contains
                (Symbol.ticker != q).asc(),
                Symbol.ticker.asc(),
            )
            .limit(8)
            .all()
        )
        return [_symbol_to_dict(s) for s in results]


@router.get("/symbols/{ticker}")
async def get_symbol(ticker: str):
    """Get a single symbol from local DB."""
    ticker = ticker.upper().strip()
    with db_session() as db:
        s = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if not s:
            raise HTTPException(status_code=404, detail=f"Symbol {ticker} not found")
        return _symbol_to_dict(s)


@router.put("/symbols/{ticker}")
async def fetch_and_upsert_symbol(ticker: str):
    """
    Fetch a single symbol from Alpaca by exact ticker and upsert into local DB.
    Called by the frontend when a symbol isn't in the local table yet.
    """
    ticker = ticker.upper().strip()
    config = get_config()

    # Check if already exists
    with db_session() as db:
        existing = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if existing:
            return _symbol_to_dict(existing)

    # Fetch from Alpaca
    await _get_rate_limiter(config.alpaca_rate_limit).acquire()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{ALPACA_TRADING_BASE}/v2/assets/{ticker}",
                headers=_alpaca_headers(),
            )
            if res.status_code == 404:
                raise HTTPException(
                    status_code=404, detail=f"Symbol {ticker} not found on Alpaca"
                )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=503, detail=f"Alpaca request failed: {exc.response.status_code}"
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca request failed: {exc}")

    asset = res.json()
    now = datetime.now(timezone.utc)

    with db_session() as db:
        existing = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        if existing:
            existing.name = asset.get("name", "")
            existing.exchange = asset.get("exchange")
            existing.asset_class = asset.get("class", "us_equity")
            existing.tradable = asset.get("tradable", True)
            existing.fractionable = asset.get("fractionable", False)
            existing.updated_at = now
        else:
            db.add(
                Symbol(
                    ticker=asset.get("symbol", ticker),
                    name=asset.get("name", ""),
                    exchange=asset.get("exchange"),
                    asset_class=asset.get("class", "us_equity"),
                    tradable=asset.get("tradable", True),
                    fractionable=asset.get("fractionable", False),
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()
        s = db.query(Symbol).filter(Symbol.ticker == ticker).first()
        return _symbol_to_dict(s)


@router.post("/symbols/seed")
async def seed_symbols():
    """
    Bulk fetch all tradable assets from Alpaca and upsert into symbol table.
    Called during setup and by the daily refresh scheduler.
    """
    config = get_config()
    headers = _alpaca_headers()

    await _get_rate_limiter(config.alpaca_rate_limit).acquire()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            stocks_res, crypto_res = await asyncio.gather(
                client.get(
                    f"{ALPACA_TRADING_BASE}/v2/assets",
                    params={"status": "active", "asset_class": "us_equity"},
                    headers=headers,
                ),
                client.get(
                    f"{ALPACA_TRADING_BASE}/v2/assets",
                    params={"status": "active", "asset_class": "crypto"},
                    headers=headers,
                ),
            )
            stocks_res.raise_for_status()
            crypto_res.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Alpaca bulk fetch failed: {exc}")

    assets = stocks_res.json() + crypto_res.json()
    tradable = [a for a in assets if a.get("tradable", False)]

    now = datetime.now(timezone.utc)
    count = 0

    with db_session() as db:
        existing_tickers = {row[0] for row in db.query(Symbol.ticker).all()}

        for asset in tradable:
            t = asset.get("symbol", "")
            if not t:
                continue

            if t in existing_tickers:
                db.query(Symbol).filter(Symbol.ticker == t).update(
                    {
                        "name": asset.get("name", ""),
                        "exchange": asset.get("exchange"),
                        "asset_class": asset.get("class", "us_equity"),
                        "tradable": asset.get("tradable", True),
                        "fractionable": asset.get("fractionable", False),
                        "updated_at": now,
                    }
                )
            else:
                db.add(
                    Symbol(
                        ticker=t,
                        name=asset.get("name", ""),
                        exchange=asset.get("exchange"),
                        asset_class=asset.get("class", "us_equity"),
                        tradable=asset.get("tradable", True),
                        fractionable=asset.get("fractionable", False),
                        created_at=now,
                        updated_at=now,
                    )
                )
            count += 1

        db.commit()

    logger.info("Seeded %d symbols", count)
    return {"count": count}
