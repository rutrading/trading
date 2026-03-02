"""Simple quote endpoint with cache and TwelveData fetch."""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.config import get_config
from app.db import Quote, db_session
from app.rate_limit import RateLimiter

logger = logging.getLogger(__name__)
router = APIRouter()

QUOTE_FIELDS = tuple(
    column.name
    for column in Quote.__table__.columns
    if column.name not in {"id", "source", "created_at", "updated_at"}
)

_rate_limiter: RateLimiter | None = None
_rate_limit_value: int | None = None


def _get_rate_limiter(calls_per_minute: int) -> RateLimiter:
    global _rate_limiter, _rate_limit_value
    if _rate_limiter is None or _rate_limit_value != calls_per_minute:
        _rate_limiter = RateLimiter(calls_per_minute)
        _rate_limit_value = calls_per_minute
    return _rate_limiter


def _is_fresh(updated_at: datetime | None, staleness_seconds: int) -> bool:
    if not updated_at:
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - updated_at < timedelta(
        seconds=staleness_seconds
    )


def _persist_quote(symbol: str, quote_data: dict) -> None:
    with db_session() as db:
        existing = db.query(Quote).filter(Quote.symbol == symbol).first()
        if existing:
            for field in QUOTE_FIELDS:
                if field != "symbol":
                    setattr(existing, field, quote_data.get(field))
            existing.updated_at = datetime.now(timezone.utc)
        else:
            payload = {field: quote_data.get(field) for field in QUOTE_FIELDS}
            payload["source"] = "api"
            db.add(Quote(**payload))
        db.commit()


@router.get("/quote")
async def get_quote(symbol: str, user: dict = Depends(get_current_user)):
    symbol = symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    config = get_config()

    # 1) Try cache first.
    try:
        with db_session() as db:
            existing = db.query(Quote).filter(Quote.symbol == symbol).first()
            if existing and _is_fresh(
                existing.updated_at, config.quote_staleness_seconds
            ):
                updated_at = existing.updated_at
                if updated_at is not None and updated_at.tzinfo is None:
                    updated_at = updated_at.replace(tzinfo=timezone.utc)
                age_seconds = 0.0
                if updated_at is not None:
                    age_seconds = (
                        datetime.now(timezone.utc) - updated_at
                    ).total_seconds()
                payload = {
                    field: getattr(existing, field, None) for field in QUOTE_FIELDS
                }
                payload.update(cached=True, age_seconds=round(age_seconds, 1))
                return payload
    except Exception as exc:
        logger.warning("cache read skipped for %s: %s", symbol, exc)

    # 2) Fetch live quote.
    await _get_rate_limiter(config.twelve_data_rate_limit).acquire()
    try:
        async with httpx.AsyncClient(
            base_url=config.twelve_data_base_url, timeout=10.0
        ) as client:
            response = await client.get(
                "/quote",
                params={"symbol": symbol, "apikey": config.twelve_data_api_key},
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Market data request failed with {exc.response.status_code}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail=f"Market data request failed: {exc}"
        )

    data = response.json()
    if "code" in data:
        upstream_code = data.get("code")
        if upstream_code == 401:
            raise HTTPException(status_code=502, detail="Invalid market data API key")
        if upstream_code in (400, 404):
            raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
        raise HTTPException(
            status_code=503,
            detail=data.get("message", "Unknown market data error"),
        )

    def to_float(key: str) -> float:
        try:
            return float(data.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    quote_data = {
        "symbol": symbol,
        "name": str(data.get("name", "")),
        "exchange": str(data.get("exchange", "")),
        "currency": str(data.get("currency", "")),
        "price": to_float("close"),
        "open": to_float("open"),
        "high": to_float("high"),
        "low": to_float("low"),
        "volume": to_float("volume"),
        "change": to_float("change"),
        "change_percent": to_float("percent_change"),
        "previous_close": to_float("previous_close"),
        "is_market_open": str(data.get("is_market_open", "")).lower() == "true",
        "timestamp": int(datetime.now(timezone.utc).timestamp()),
    }

    # 3) Save best-effort, still return live quote if save fails.
    try:
        _persist_quote(symbol, quote_data)
    except Exception as exc:
        logger.warning("persist skipped for %s: %s", symbol, exc)

    payload = {field: quote_data.get(field) for field in QUOTE_FIELDS}
    payload["cached"] = False
    return payload
