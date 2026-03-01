"""MarketDataService - fetches stock quotes from external APIs."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import grpc
import httpx
from trading_lib.config import Config

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple rate limiter for API calls.

    Ensures we don't exceed the configured calls per minute.
    """

    def __init__(self, calls_per_minute: int):
        self.calls_per_minute = calls_per_minute
        self.interval = 60.0 / calls_per_minute  # seconds between calls
        self.last_call = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        """Wait if needed to respect rate limit."""
        async with self._lock:
            now = time.time()
            elapsed = now - self.last_call
            if elapsed < self.interval:
                await asyncio.sleep(self.interval - elapsed)
            self.last_call = time.time()


class MarketDataServicer:
    """Fetches market data from TwelveData API."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.client = httpx.AsyncClient(
            base_url=config.twelve_data_base_url,
            timeout=10.0,
        )
        self.alpaca_client = httpx.AsyncClient(
            base_url=config.alpaca_data_base_url,
            timeout=20.0,
        )
        # Rate limiter to respect TwelveData's free tier limits
        self.rate_limiter = RateLimiter(config.twelve_data_rate_limit)

    async def Fetch(self, request, context):
        """Fetch a single stock quote from TwelveData."""
        from generated import market_data_pb2

        symbol = request.symbol.upper()

        try:
            # Wait for rate limiter before making API call
            await self.rate_limiter.acquire()

            response = await self.client.get(
                "/quote",
                params={
                    "symbol": symbol,
                    "apikey": self.config.twelve_data_api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

            # Check for API errors in response
            if "code" in data:
                msg = data.get("message", "Unknown error")
                logger.error("TwelveData error for %s: %s", symbol, msg)

                if data["code"] == 401:
                    context.set_code(grpc.StatusCode.UNAUTHENTICATED)
                    context.set_details("Invalid API key")
                elif data["code"] == 404:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    context.set_details(f"Symbol {symbol} not found")
                else:
                    context.set_code(grpc.StatusCode.UNAVAILABLE)
                    context.set_details(msg)
                return market_data_pb2.FetchResponse()

            # Convert nested dicts to JSON strings for the raw field
            raw = {
                k: (json.dumps(v) if isinstance(v, dict) else str(v))
                for k, v in data.items()
            }

            logger.info("Fetched %s: $%.2f", symbol, float(data.get("close", 0)))

            return market_data_pb2.FetchResponse(
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

        except httpx.HTTPStatusError as e:
            logger.error("HTTP error for %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.UNAVAILABLE)
            context.set_details(f"API error: {e.response.status_code}")
            return market_data_pb2.FetchResponse()

        except Exception as e:
            logger.error("Failed to fetch %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return market_data_pb2.FetchResponse()

    async def BulkFetch(self, request, context):
        """Fetch quotes for multiple symbols.

        Note: Calls are made sequentially to respect rate limits.
        """
        from generated import market_data_pb2

        quotes = []
        for symbol in request.symbols:
            quote = await self.Fetch(
                market_data_pb2.FetchRequest(symbol=symbol),
                context,
            )
            quotes.append(quote)

        return market_data_pb2.BulkFetchResponse(quotes=quotes)

    async def FetchHistoricalBars(self, request, context):
        """Fetch historical bars for a single symbol from Alpaca."""
        from generated import market_data_pb2

        symbol = request.symbol.upper().strip()
        timeframe = request.timeframe.strip()
        start = request.start.strip()
        end = request.end.strip()

        if not symbol or not timeframe or not start or not end:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("symbol, timeframe, start, and end are required")
            return market_data_pb2.HistoricalBarsResponse()

        if not self.config.alpaca_api_key or not self.config.alpaca_secret_key:
            context.set_code(grpc.StatusCode.UNAUTHENTICATED)
            context.set_details("Missing Alpaca API credentials")
            return market_data_pb2.HistoricalBarsResponse()

        try:
            start_dt = _parse_iso_utc(start)
            end_dt = _parse_iso_utc(end)
        except ValueError:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("start and end must be valid ISO-8601 datetimes")
            return market_data_pb2.HistoricalBarsResponse()

        if start_dt >= end_dt:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("start must be before end")
            return market_data_pb2.HistoricalBarsResponse()

        try:
            response = await self.alpaca_client.get(
                f"/v2/stocks/{symbol}/bars",
                params={
                    "timeframe": timeframe,
                    "start": start,
                    "end": end,
                    "feed": self.config.alpaca_feed,
                    "adjustment": "raw",
                    "sort": "asc",
                    "limit": 10000,
                },
                headers={
                    "APCA-API-KEY-ID": self.config.alpaca_api_key,
                    "APCA-API-SECRET-KEY": self.config.alpaca_secret_key,
                },
            )
            response.raise_for_status()
            payload = response.json()
            bars = payload.get("bars", [])

            transformed = []
            for bar in bars:
                # Alpaca uses ISO-8601 under "t". Lightweight Charts accepts
                # epoch seconds for candle time.
                ts = _parse_iso_utc(bar.get("t", "")).timestamp()
                transformed.append(
                    market_data_pb2.HistoricalBar(
                        timestamp=int(ts),
                        open=float(bar.get("o", 0)),
                        high=float(bar.get("h", 0)),
                        low=float(bar.get("l", 0)),
                        close=float(bar.get("c", 0)),
                        volume=float(bar.get("v", 0)),
                        vwap=float(bar.get("vw", 0)),
                        trade_count=int(bar.get("n", 0)),
                    )
                )

            return market_data_pb2.HistoricalBarsResponse(
                symbol=symbol,
                timeframe=timeframe,
                bars=transformed,
                source="alpaca",
            )
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            if status_code in (401, 403):
                context.set_code(grpc.StatusCode.UNAUTHENTICATED)
                context.set_details("Alpaca authentication failed")
            elif status_code == 404:
                context.set_code(grpc.StatusCode.NOT_FOUND)
                context.set_details(f"Symbol {symbol} not found")
            elif status_code == 422:
                context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
                context.set_details("Invalid historical bars request parameters")
            else:
                context.set_code(grpc.StatusCode.UNAVAILABLE)
                context.set_details(f"Alpaca request failed ({status_code})")
            return market_data_pb2.HistoricalBarsResponse()
        except ValueError as e:
            logger.error("Invalid Alpaca bar payload for %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details("Invalid data returned by Alpaca")
            return market_data_pb2.HistoricalBarsResponse()
        except Exception as e:
            logger.exception("Failed to fetch historical bars for %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return market_data_pb2.HistoricalBarsResponse()


def _parse_iso_utc(value: str) -> datetime:
    if not value:
        raise ValueError("missing ISO datetime")
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
