import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import get_current_user
from app.config import get_config
from app.rate_limit import RateLimiter

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_TIMEFRAMES = {"1Min", "30Min", "1Hour", "1Day", "1Month"}

_alpaca_rate_limiter: RateLimiter | None = None
_alpaca_rate_limit_value: int | None = None


def _get_alpaca_rate_limiter(calls_per_minute: int) -> RateLimiter:
    global _alpaca_rate_limiter, _alpaca_rate_limit_value
    if _alpaca_rate_limiter is None or _alpaca_rate_limit_value != calls_per_minute:
        _alpaca_rate_limiter = RateLimiter(calls_per_minute)
        _alpaca_rate_limit_value = calls_per_minute
    return _alpaca_rate_limiter


def _parse_iso_utc(value: str) -> datetime:
    if not value:
        raise ValueError("missing ISO datetime")
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class HistoricalBarsRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=16)
    timeframe: str
    start: str
    end: str

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        symbol = value.strip().upper()
        if not symbol:
            raise ValueError("symbol is required")
        return symbol

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, value: str) -> str:
        timeframe = value.strip()
        if timeframe not in ALLOWED_TIMEFRAMES:
            raise ValueError(
                f"timeframe must be one of: {', '.join(sorted(ALLOWED_TIMEFRAMES))}"
            )
        return timeframe

    @field_validator("start", "end")
    @classmethod
    def validate_datetime(cls, value: str) -> str:
        try:
            _parse_iso_utc(value)
        except ValueError:
            raise ValueError("must be a valid ISO-8601 datetime")
        return value


@router.post("/historical-bars")
async def get_historical_bars(
    payload: HistoricalBarsRequest,
    user: dict = Depends(get_current_user),
):
    start_dt = _parse_iso_utc(payload.start)
    end_dt = _parse_iso_utc(payload.end)
    if start_dt >= end_dt:
        raise HTTPException(status_code=400, detail="start must be before end")

    config = get_config()
    if not config.alpaca_api_key or not config.alpaca_secret_key:
        raise HTTPException(status_code=502, detail="Missing Alpaca API credentials")

    await _get_alpaca_rate_limiter(config.alpaca_rate_limit).acquire()

    try:
        async with httpx.AsyncClient(
            base_url=config.alpaca_data_base_url, timeout=20.0
        ) as client:
            response = await client.get(
                f"/v2/stocks/{payload.symbol}/bars",
                params={
                    "timeframe": payload.timeframe,
                    "start": payload.start,
                    "end": payload.end,
                    "feed": config.alpaca_feed,
                    "adjustment": "raw",
                    "sort": "asc",
                    "limit": 10000,
                },
                headers={
                    "APCA-API-KEY-ID": config.alpaca_api_key,
                    "APCA-API-SECRET-KEY": config.alpaca_secret_key,
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code in (401, 403):
            raise HTTPException(status_code=502, detail="Alpaca authentication failed")
        if status_code == 404:
            raise HTTPException(
                status_code=404, detail=f"Symbol {payload.symbol} not found"
            )
        if status_code == 422:
            raise HTTPException(
                status_code=400, detail="Invalid historical bars request parameters"
            )
        if status_code == 429:
            raise HTTPException(status_code=429, detail="Alpaca rate limit exceeded")
        raise HTTPException(
            status_code=503, detail=f"Alpaca request failed ({status_code})"
        )
    except Exception as exc:
        logger.exception(
            "Failed to fetch historical bars for %s: %s", payload.symbol, exc
        )
        raise HTTPException(status_code=503, detail=f"Alpaca request failed: {exc}")

    body = response.json()
    bars = body.get("bars", [])
    transformed = []

    for bar in bars:
        try:
            ts = int(_parse_iso_utc(str(bar.get("t", ""))).timestamp())
        except ValueError:
            logger.warning("Skipping invalid bar timestamp for %s", payload.symbol)
            continue

        transformed.append(
            {
                "time": ts,
                "open": float(bar.get("o", 0)),
                "high": float(bar.get("h", 0)),
                "low": float(bar.get("l", 0)),
                "close": float(bar.get("c", 0)),
                "volume": float(bar.get("v", 0)),
                "vwap": float(bar.get("vw", 0)),
                "trade_count": int(bar.get("n", 0)),
            }
        )

    return {
        "symbol": payload.symbol,
        "timeframe": payload.timeframe,
        "source": "alpaca",
        "bars": transformed,
    }
