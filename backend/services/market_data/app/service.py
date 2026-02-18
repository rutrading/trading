"""MarketDataService - fetches stock quotes from external APIs."""

import asyncio
import json
import logging
import time

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
        # Rate limiter to respect TwelveData's free tier limits
        self.rate_limiter = RateLimiter(config.twelve_data_rate_limit)

    async def GetQuote(self, request, context):
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
                return market_data_pb2.GetQuoteResponse()

            # Convert nested dicts to JSON strings for the raw field
            raw = {
                k: (json.dumps(v) if isinstance(v, dict) else str(v))
                for k, v in data.items()
            }

            logger.info("Fetched %s: $%.2f", symbol, float(data.get("close", 0)))

            return market_data_pb2.GetQuoteResponse(
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
            return market_data_pb2.GetQuoteResponse()

        except Exception as e:
            logger.error("Failed to fetch %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return market_data_pb2.GetQuoteResponse()

    async def BulkFetch(self, request, context):
        """Fetch quotes for multiple symbols.

        Note: Calls are made sequentially to respect rate limits.
        """
        from generated import market_data_pb2

        quotes = []
        for symbol in request.symbols:
            quote = await self.GetQuote(
                market_data_pb2.GetQuoteRequest(symbol=symbol),
                context,
            )
            quotes.append(quote)

        return market_data_pb2.BulkFetchResponse(quotes=quotes)
