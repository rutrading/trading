import asyncio
import json
import logging
import time
from dataclasses import dataclass, fields

import httpx

from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.utils import safe_float, upsert_quote

logger = logging.getLogger(__name__)


class PipelineError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class RawQuote:
    symbol: str
    price: float
    open: float
    high: float
    low: float
    volume: float
    timestamp: int
    source: str
    raw: dict[str, str]


@dataclass
class TransformedQuote:
    symbol: str
    name: str = ""
    exchange: str = ""
    currency: str = ""
    price: float = 0.0
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    volume: float = 0.0
    change: float = 0.0
    change_percent: float = 0.0
    previous_close: float = 0.0
    is_market_open: bool = False
    average_volume: float = 0.0
    fifty_two_week_low: float = 0.0
    fifty_two_week_high: float = 0.0
    day_range_pct: float = 0.0
    fifty_two_week_pct: float = 0.0
    gap_pct: float = 0.0
    volume_ratio: float = 0.0
    intraday_range_pct: float = 0.0
    signal: str = "neutral"
    example: str = "test"
    timestamp: int = 0


class RateLimiter:
    def __init__(self, calls_per_minute: int):
        self.calls_per_minute = max(1, calls_per_minute)
        self.interval = 60.0 / self.calls_per_minute
        self.last_call = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_call
            if elapsed < self.interval:
                await asyncio.sleep(self.interval - elapsed)
            self.last_call = time.time()


class MarketDataClient:
    def __init__(self, config: Config, client: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self.client = client or httpx.AsyncClient(
            base_url=config.twelve_data_base_url,
            timeout=10.0,
        )
        self.rate_limiter = RateLimiter(config.twelve_data_rate_limit)

    async def fetch_quote(self, symbol: str) -> RawQuote:
        symbol = symbol.upper().strip()
        if not symbol:
            raise PipelineError("bad_request", "Symbol is required")

        await self.rate_limiter.acquire()
        try:
            response = await self.client.get(
                "/quote",
                params={
                    "symbol": symbol,
                    "apikey": self.config.twelve_data_api_key,
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PipelineError(
                "upstream_error",
                f"Market data request failed with {exc.response.status_code}",
            ) from exc
        except Exception as exc:
            raise PipelineError(
                "unavailable", f"Market data request failed: {exc}"
            ) from exc

        data = response.json()
        if "code" in data:
            message = data.get("message", "Unknown market data error")
            code = data.get("code")
            if code == 401:
                raise PipelineError("unauthorized", "Invalid market data API key")
            if code in (400, 404):
                raise PipelineError("not_found", f"Symbol {symbol} not found")
            raise PipelineError("unavailable", message)

        raw = {
            key: (json.dumps(value) if isinstance(value, dict) else str(value))
            for key, value in data.items()
        }
        return RawQuote(
            symbol=symbol,
            price=float(data.get("close", 0)),
            open=float(data.get("open", 0)),
            high=float(data.get("high", 0)),
            low=float(data.get("low", 0)),
            volume=float(data.get("volume", 0)),
            timestamp=int(time.time()),
            source="twelvedata",
            raw=raw,
        )


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


def transform_quote(raw_quote: RawQuote) -> TransformedQuote:
    raw = dict(raw_quote.raw)
    change = safe_float(raw, "change")
    change_percent = safe_float(raw, "percent_change")
    previous_close = safe_float(raw, "previous_close")
    average_volume = safe_float(raw, "average_volume")

    fifty_two_week_low, fifty_two_week_high = 0.0, 0.0
    fifty_two_week_raw = raw.get("fifty_two_week", "")
    if fifty_two_week_raw.startswith("{"):
        try:
            parsed = json.loads(fifty_two_week_raw)
            fifty_two_week_low = float(parsed.get("low", 0))
            fifty_two_week_high = float(parsed.get("high", 0))
        except (json.JSONDecodeError, ValueError):
            pass

    day_range = raw_quote.high - raw_quote.low
    day_range_pct = _safe_pct(raw_quote.price - raw_quote.low, day_range)
    fifty_two_week_pct = _safe_pct(
        raw_quote.price - fifty_two_week_low,
        fifty_two_week_high - fifty_two_week_low,
    )
    gap_pct = (
        _safe_pct(raw_quote.open - previous_close, previous_close)
        if previous_close
        else 0.0
    )
    volume_ratio = (
        round(raw_quote.volume / average_volume, 2) if average_volume else 0.0
    )
    intraday_range_pct = _safe_pct(day_range, raw_quote.open) if raw_quote.open else 0.0
    signal = _derive_signal(change_percent, volume_ratio, day_range_pct)

    return TransformedQuote(
        symbol=raw_quote.symbol,
        price=raw_quote.price,
        change=round(change, 4),
        change_percent=round(change_percent, 4),
        open=raw_quote.open,
        high=raw_quote.high,
        low=raw_quote.low,
        volume=raw_quote.volume,
        timestamp=raw_quote.timestamp,
        name=raw.get("name", ""),
        exchange=raw.get("exchange", ""),
        currency=raw.get("currency", ""),
        previous_close=previous_close,
        is_market_open=raw.get("is_market_open", "").lower() == "true",
        average_volume=average_volume,
        fifty_two_week_low=fifty_two_week_low,
        fifty_two_week_high=fifty_two_week_high,
        day_range_pct=day_range_pct,
        fifty_two_week_pct=fifty_two_week_pct,
        gap_pct=gap_pct,
        volume_ratio=volume_ratio,
        intraday_range_pct=intraday_range_pct,
        signal=signal,
    )


def persist_quote(quote: TransformedQuote) -> None:
    db = next(get_db())
    try:
        upsert_quote(db, quote)
    finally:
        db.close()


def as_dict(data: object) -> dict:
    return {field.name: getattr(data, field.name) for field in fields(data)}
