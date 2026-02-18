"""Scheduler service that periodically fetches and processes market data."""

import asyncio
import logging

from trading_lib.channel import create_channel
from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.models import Quote
from trading_lib.utils import is_market_open, is_quote_fresh

logger = logging.getLogger(__name__)

# Polling intervals (free tier = 8 calls/min)
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
        logger.info("Scheduler starting, loading symbols from DB...")

        # Wait for other services to start before first poll
        logger.info("Waiting 5s for services to start...")
        await asyncio.sleep(5)

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
            market_open = is_market_open()
            interval = MARKET_HOURS_INTERVAL if market_open else OFF_MARKET_INTERVAL
            market_status = "open" if market_open else "closed"

            symbols = _get_tracked_symbols()
            if not symbols:
                logger.info(
                    "No symbols in DB yet, waiting %ds (market %s)",
                    interval,
                    market_status,
                )
                try:
                    await asyncio.sleep(interval)
                except asyncio.CancelledError:
                    logger.info("Scheduler shutting down")
                    return
                continue

            # Only fetch symbols whose quotes are stale
            stale = _get_stale_symbols(symbols, self.config.quote_staleness_seconds)

            if not stale:
                logger.info(
                    "All %d symbols fresh, skipping (market %s)",
                    len(symbols),
                    market_status,
                )
                try:
                    await asyncio.sleep(interval)
                except asyncio.CancelledError:
                    logger.info("Scheduler shutting down")
                    return
                continue

            logger.info(
                "Market %s, polling %d/%d stale symbols every %ds",
                market_status,
                len(stale),
                len(symbols),
                interval,
            )

            try:
                # Step 1: Fetch from MarketData
                bulk_request = market_data_pb2.BulkFetchRequest(symbols=stale)
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
                filter_request = filter_pb2.BulkProcessRequest(
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

            except asyncio.CancelledError:
                logger.info("Scheduler shutting down")
                return
            except Exception as e:
                logger.error("Scheduler pipeline error: %s", e)

            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                logger.info("Scheduler shutting down")
                return
