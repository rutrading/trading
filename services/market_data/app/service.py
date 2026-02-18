"""MarketDataService gRPC servicer implementation."""

import json
import logging
import time

import grpc
import httpx

from trading_lib.config import Config

logger = logging.getLogger(__name__)


class MarketDataServicer:
    """Fetches market data from external APIs (TwelveData, etc.)."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.client = httpx.AsyncClient(
            base_url=config.twelve_data_base_url,
            timeout=10.0,
        )

    async def GetQuote(self, request, context):
        """Fetch a single stock quote from TwelveData."""
        from generated import market_data_pb2

        symbol = request.symbol.upper()

        try:
            response = await self.client.get(
                "/quote",
                params={
                    "symbol": symbol,
                    "apikey": self.config.twelve_data_api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

            if "code" in data:
                msg = data.get("message", "Unknown error")
                logger.error("TwelveData error for %s: %s", symbol, msg)
                if data["code"] == 401:
                    context.set_code(grpc.StatusCode.UNAUTHENTICATED)
                    context.set_details(f"TwelveData API key missing or invalid: {msg}")
                elif data["code"] == 404:
                    context.set_code(grpc.StatusCode.NOT_FOUND)
                    context.set_details(f"Symbol {symbol} not found")
                else:
                    context.set_code(grpc.StatusCode.UNAVAILABLE)
                    context.set_details(f"TwelveData error: {msg}")
                return market_data_pb2.GetQuoteResponse()

            # Use json.dumps for nested dicts so downstream can json.loads cleanly
            raw = {
                k: (json.dumps(v) if isinstance(v, dict) else str(v))
                for k, v in data.items()
            }

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
            logger.error("TwelveData HTTP error: %s", e)
            context.set_code(grpc.StatusCode.UNAVAILABLE)
            context.set_details(f"TwelveData API error: {e.response.status_code}")
            return market_data_pb2.GetQuoteResponse()
        except Exception as e:
            logger.error("Failed to fetch quote for %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return market_data_pb2.GetQuoteResponse()

    async def BulkFetch(self, request, context):
        """Fetch quotes for multiple symbols."""
        from generated import market_data_pb2

        quotes = []
        for symbol in request.symbols:
            quote_request = market_data_pb2.GetQuoteRequest(symbol=symbol)
            quote = await self.GetQuote(quote_request, context)
            quotes.append(quote)

        return market_data_pb2.BulkFetchResponse(quotes=quotes)
