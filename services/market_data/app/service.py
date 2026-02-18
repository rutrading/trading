"""MarketDataService gRPC servicer implementation."""

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
        logger.info("Fetching quote for %s", symbol)

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

            if "code" in data and data["code"] != 200:
                context.set_code(grpc.StatusCode.NOT_FOUND)
                context.set_details(f"Symbol {symbol} not found")
                return market_data_pb2.QuoteResponse()

            return market_data_pb2.QuoteResponse(
                symbol=symbol,
                price=float(data.get("close", 0)),
                open=float(data.get("open", 0)),
                high=float(data.get("high", 0)),
                low=float(data.get("low", 0)),
                volume=float(data.get("volume", 0)),
                timestamp=int(time.time()),
                source="twelvedata",
                raw={k: str(v) for k, v in data.items()},
            )
        except httpx.HTTPStatusError as e:
            logger.error("TwelveData HTTP error: %s", e)
            context.set_code(grpc.StatusCode.UNAVAILABLE)
            context.set_details(f"TwelveData API error: {e.response.status_code}")
            return market_data_pb2.QuoteResponse()
        except Exception as e:
            logger.error("Failed to fetch quote for %s: %s", symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return market_data_pb2.QuoteResponse()

    async def BulkFetch(self, request, context):
        """Fetch quotes for multiple symbols."""
        from generated import market_data_pb2

        quotes = []
        for symbol in request.symbols:
            quote_request = market_data_pb2.QuoteRequest(symbol=symbol)
            quote = await self.GetQuote(quote_request, context)
            quotes.append(quote)

        return market_data_pb2.BulkFetchResponse(quotes=quotes)
