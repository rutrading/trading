"""Scheduler service that periodically fetches and processes market data."""

import asyncio
import logging
from datetime import datetime, timezone

from trading_lib.channel import create_channel
from trading_lib.config import Config

logger = logging.getLogger(__name__)

# US market hours (ET): 9:30 AM - 4:00 PM
MARKET_OPEN_HOUR = 14  # 9:30 AM ET = 14:30 UTC
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 21  # 4:00 PM ET = 21:00 UTC

# Default symbols to track
DEFAULT_SYMBOLS = ["AAPL", "GOOG", "MSFT", "TSLA", "AMZN"]

# Polling intervals
MARKET_HOURS_INTERVAL = 60  # seconds (slower to preserve API rate limits)
OFF_MARKET_INTERVAL = 15  # seconds (faster to pre-cache)


def is_market_open() -> bool:
    """Check if US stock market is currently open (approximate, UTC-based)."""
    now = datetime.now(timezone.utc)
    # Skip weekends
    if now.weekday() >= 5:
        return False
    hour, minute = now.hour, now.minute
    if hour < MARKET_OPEN_HOUR or hour >= MARKET_CLOSE_HOUR:
        return False
    if hour == MARKET_OPEN_HOUR and minute < MARKET_OPEN_MINUTE:
        return False
    return True


class Scheduler:
    """Periodically calls the gRPC pipeline to fetch and cache market data."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.symbols = DEFAULT_SYMBOLS

    async def run(self) -> None:
        """Main scheduler loop."""
        logger.info("Scheduler starting with symbols: %s", self.symbols)

        market_data_channel = create_channel(self.config.market_data_host)
        transformer_channel = create_channel(self.config.transformer_host)
        filter_channel = create_channel(self.config.filter_host)

        from generated import (
            filter_pb2,
            filter_pb2_grpc,
            market_data_pb2,
            market_data_pb2_grpc,
            transformer_pb2,
            transformer_pb2_grpc,
        )

        market_data_stub = market_data_pb2_grpc.MarketDataServiceStub(
            market_data_channel
        )
        transformer_stub = transformer_pb2_grpc.TransformerServiceStub(
            transformer_channel
        )
        filter_stub = filter_pb2_grpc.FilterServiceStub(filter_channel)

        while True:
            interval = (
                MARKET_HOURS_INTERVAL if is_market_open() else OFF_MARKET_INTERVAL
            )
            market_status = "open" if is_market_open() else "closed"
            logger.info("Market %s, polling every %ds", market_status, interval)

            try:
                # Step 1: Fetch from MarketData
                bulk_request = market_data_pb2.BulkFetchRequest(symbols=self.symbols)
                bulk_response = await market_data_stub.BulkFetch(
                    bulk_request, timeout=30
                )
                logger.info("Fetched %d quotes", len(bulk_response.quotes))

                # Step 2: Transform
                transform_request = transformer_pb2.BulkTransformRequest(
                    raw_quotes=bulk_response.quotes
                )
                transform_response = await transformer_stub.BulkTransform(
                    transform_request, timeout=10
                )
                logger.info(
                    "Transformed %d quotes",
                    len(transform_response.quotes),
                )

                # Step 3: Filter and persist
                filter_request = filter_pb2.BulkFilterRequest(
                    quotes=transform_response.quotes
                )
                filter_response = await filter_stub.BulkProcess(
                    filter_request, timeout=10
                )
                persisted = sum(1 for r in filter_response.results if r.persisted)
                logger.info(
                    "Persisted %d/%d quotes",
                    persisted,
                    len(filter_response.results),
                )

            except Exception as e:
                logger.error("Scheduler pipeline error: %s", e)

            await asyncio.sleep(interval)
