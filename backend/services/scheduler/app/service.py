"""Scheduler service that periodically fetches and processes market data."""

import asyncio
import logging

from trading_lib.channel import create_channel
from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.models import Quote
from trading_lib.utils import is_market_open, is_quote_fresh

logger = logging.getLogger(__name__)

# Polling intervals
MARKET_HOURS_INTERVAL = 60  # seconds during market hours
OFF_MARKET_INTERVAL = 300  # 5 minutes when market is closed


def _get_tracked_symbols() -> list[str]:
    """Return distinct symbols already stored in the quotes table."""
    db = next(get_db())
    try:
        rows = db.query(Quote.symbol).distinct().all()
        return [row[0] for row in rows]
    finally:
        db.close()


def _get_stale_symbols(symbols: list[str], staleness_seconds: int) -> list[str]:
    """Return symbols whose cached quote is not fresh."""
    db = next(get_db())
    try:
        stale = []
        for sym in symbols:
            quote = db.query(Quote).filter(Quote.symbol == sym).first()
            if quote is None or not is_quote_fresh(quote.updated_at, staleness_seconds):
                stale.append(sym)
        return stale
    finally:
        db.close()


class Scheduler:
    """Periodically calls the gRPC pipeline to fetch and cache market data."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def run(self) -> None:
        """Main scheduler loop."""
        logger.info("Scheduler starting...")

        # Wait for other services to start
        await asyncio.sleep(5)

        # Create channels to other services
        market_data_channel = create_channel(self.config.market_data_host)
        transformer_channel = create_channel(self.config.transformer_host)
        persistence_channel = create_channel(self.config.persistence_host)

        from generated import (
            market_data_pb2,
            market_data_pb2_grpc,
            persistence_pb2,
            persistence_pb2_grpc,
            transformer_pb2,
            transformer_pb2_grpc,
        )

        market_data_stub = market_data_pb2_grpc.MarketDataServiceStub(
            market_data_channel
        )
        transformer_stub = transformer_pb2_grpc.TransformerServiceStub(
            transformer_channel
        )
        persistence_stub = persistence_pb2_grpc.PersistenceServiceStub(
            persistence_channel
        )

        while True:
            market_open = is_market_open()
            interval = MARKET_HOURS_INTERVAL if market_open else OFF_MARKET_INTERVAL
            market_status = "open" if market_open else "closed"

            symbols = _get_tracked_symbols()
            if not symbols:
                logger.info(
                    "No symbols in DB, waiting %ds (market %s)", interval, market_status
                )
                await self._sleep(interval)
                continue

            # Only fetch symbols whose quotes are stale
            stale = _get_stale_symbols(symbols, self.config.quote_staleness_seconds)
            if not stale:
                logger.info(
                    "All %d symbols fresh, skipping (market %s)",
                    len(symbols),
                    market_status,
                )
                await self._sleep(interval)
                continue

            logger.info(
                "Polling %d/%d stale symbols (market %s)",
                len(stale),
                len(symbols),
                market_status,
            )

            try:
                # Step 1: Fetch raw quotes from MarketData
                fetch_response = await market_data_stub.BulkFetch(
                    market_data_pb2.BulkFetchRequest(symbols=stale),
                    timeout=30,
                )
                logger.info("Fetched %d quotes", len(fetch_response.quotes))

                # Step 2: Transform the quotes
                transform_response = await transformer_stub.BulkTransform(
                    transformer_pb2.BulkTransformRequest(
                        raw_quotes=fetch_response.quotes
                    ),
                    timeout=10,
                )
                logger.info("Transformed %d quotes", len(transform_response.quotes))

                # Step 3: Persist to database
                persist_response = await persistence_stub.BulkPersist(
                    persistence_pb2.BulkPersistRequest(
                        quotes=transform_response.quotes
                    ),
                    timeout=10,
                )
                saved = sum(1 for r in persist_response.results if r.success)
                logger.info("Saved %d/%d quotes", saved, len(persist_response.results))

            except asyncio.CancelledError:
                logger.info("Scheduler shutting down")
                return
            except Exception as e:
                logger.error("Pipeline error: %s", e)

            await self._sleep(interval)

    async def _sleep(self, seconds: int) -> None:
        """Sleep with cancellation support."""
        try:
            await asyncio.sleep(seconds)
        except asyncio.CancelledError:
            logger.info("Scheduler shutting down")
            raise
