"""Simple quote endpoint with cache + TwelveData fetch."""

import json
import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.config import Config, get_config
from app.db import Quote, get_db
from app.rate_limit import RateLimiter

logger = logging.getLogger(__name__)
router = APIRouter()

QUOTE_FIELDS = tuple(
    column.name
    for column in Quote.__table__.columns
    if column.name not in {"id", "source", "created_at", "updated_at"}
)

MARKET_OPEN_HOUR = 14
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 21

_rate_limiter: RateLimiter | None = None
_rate_limit_value: int | None = None


def _get_rate_limiter(calls_per_minute: int) -> RateLimiter:
    global _rate_limiter, _rate_limit_value
    if _rate_limiter is None or _rate_limit_value != calls_per_minute:
        _rate_limiter = RateLimiter(calls_per_minute)
        _rate_limit_value = calls_per_minute
    return _rate_limiter


def _safe_float(data: dict, key: str, fallback: float = 0.0) -> float:
    try:
        return float(data.get(key, fallback))
    except (ValueError, TypeError):
        return fallback


def _safe_pct(numerator: float, denominator: float) -> float:
    if not denominator:
        return 0.0
    return round(numerator / denominator * 100, 2)


def _derive_signal(change_pct: float, volume_ratio: float, day_range_pct: float) -> str:
    if change_pct > 0 and (volume_ratio > 1.0 or day_range_pct > 66):
        return "bullish"
    if change_pct < 0 and (volume_ratio > 1.0 or day_range_pct < 33):
        return "bearish"
    return "neutral"


def _is_market_open() -> bool:
    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:
        return False
    hour, minute = now.hour, now.minute
    if hour < MARKET_OPEN_HOUR or hour >= MARKET_CLOSE_HOUR:
        return False
    if hour == MARKET_OPEN_HOUR and minute < MARKET_OPEN_MINUTE:
        return False
    return True


def _last_market_close() -> datetime:
    now = datetime.now(timezone.utc)
    close_today = now.replace(hour=MARKET_CLOSE_HOUR, minute=0, second=0, microsecond=0)
    weekday = now.weekday()
    if weekday == 5:
        return close_today - timedelta(days=1)
    if weekday == 6:
        return close_today - timedelta(days=2)
    if now >= close_today:
        return close_today
    if weekday == 0:
        return close_today - timedelta(days=3)
    return close_today - timedelta(days=1)


def _is_quote_fresh(updated_at: datetime | None, staleness_seconds: int) -> bool:
    if updated_at is None:
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    if _is_market_open():
        age = (datetime.now(timezone.utc) - updated_at).total_seconds()
        return age < staleness_seconds
    return updated_at > _last_market_close()


def _quote_dict(source: object, **extra: object) -> dict:
    if isinstance(source, dict):
        result = {field: source.get(field) for field in QUOTE_FIELDS}
    else:
        result = {field: getattr(source, field, None) for field in QUOTE_FIELDS}
    result.update(extra)
    return result


def _upsert_quote(quote_data: dict) -> None:
    symbol = quote_data.get("symbol")
    if not isinstance(symbol, str) or not symbol:
        raise ValueError("Quote symbol is required")

    db = next(get_db())
    try:
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
    finally:
        db.close()


def _build_quote_data(symbol: str, data: dict) -> dict:
    change = _safe_float(data, "change")
    change_percent = _safe_float(data, "percent_change")
    previous_close = _safe_float(data, "previous_close")
    average_volume = _safe_float(data, "average_volume")

    fifty_two_week_low = 0.0
    fifty_two_week_high = 0.0
    fifty_two_week = data.get("fifty_two_week")
    if isinstance(fifty_two_week, dict):
        fifty_two_week_low = _safe_float(fifty_two_week, "low")
        fifty_two_week_high = _safe_float(fifty_two_week, "high")
    elif isinstance(fifty_two_week, str) and fifty_two_week.startswith("{"):
        try:
            parsed = json.loads(fifty_two_week)
            fifty_two_week_low = _safe_float(parsed, "low")
            fifty_two_week_high = _safe_float(parsed, "high")
        except json.JSONDecodeError:
            pass

    price = _safe_float(data, "close")
    open_price = _safe_float(data, "open")
    high = _safe_float(data, "high")
    low = _safe_float(data, "low")
    volume = _safe_float(data, "volume")

    day_range = high - low
    day_range_pct = _safe_pct(price - low, day_range)
    fifty_two_week_pct = _safe_pct(
        price - fifty_two_week_low, fifty_two_week_high - fifty_two_week_low
    )
    gap_pct = (
        _safe_pct(open_price - previous_close, previous_close)
        if previous_close
        else 0.0
    )
    volume_ratio = round(volume / average_volume, 2) if average_volume else 0.0
    intraday_range_pct = _safe_pct(day_range, open_price) if open_price else 0.0
    signal = _derive_signal(change_percent, volume_ratio, day_range_pct)

    return {
        "symbol": symbol,
        "name": str(data.get("name", "")),
        "exchange": str(data.get("exchange", "")),
        "currency": str(data.get("currency", "")),
        "price": price,
        "open": open_price,
        "high": high,
        "low": low,
        "volume": volume,
        "change": round(change, 4),
        "change_percent": round(change_percent, 4),
        "previous_close": previous_close,
        "is_market_open": str(data.get("is_market_open", "")).lower() == "true",
        "average_volume": average_volume,
        "fifty_two_week_low": fifty_two_week_low,
        "fifty_two_week_high": fifty_two_week_high,
        "day_range_pct": day_range_pct,
        "fifty_two_week_pct": fifty_two_week_pct,
        "gap_pct": gap_pct,
        "volume_ratio": volume_ratio,
        "intraday_range_pct": intraday_range_pct,
        "signal": signal,
        "timestamp": int(datetime.now(timezone.utc).timestamp()),
    }


@router.get("/quote")
async def get_quote(symbol: str, user: dict = Depends(get_current_user)):
    symbol = symbol.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")

    config = get_config()

    # 1) Try returning a fresh cached quote.
    try:
        db = next(get_db())
        try:
            existing = db.query(Quote).filter(Quote.symbol == symbol).first()
            if existing and _is_quote_fresh(
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
                return _quote_dict(
                    existing, cached=True, age_seconds=round(age_seconds, 1)
                )
        finally:
            db.close()
    except Exception as exc:
        logger.warning("cache read skipped for %s: %s", symbol, exc)

    # 2) Fetch current quote from TwelveData.
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

    quote_data = _build_quote_data(symbol, data)

    # 3) Persist best-effort, but do not fail the response.
    try:
        _upsert_quote(quote_data)
    except Exception as exc:
        logger.warning("persist skipped for %s: %s", symbol, exc)

    return _quote_dict(quote_data, cached=False)
