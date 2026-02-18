"""PersistenceService gRPC servicer - saves quotes to the database."""

import asyncio
import logging

import grpc

from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.utils import upsert_quote

logger = logging.getLogger(__name__)


class PersistenceServicer:
    """Saves transformed stock quotes to the database."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def Persist(self, request, context):
        """Save a single quote to the database.

        Returns a PersistResponse indicating success or failure.
        """
        from generated import persistence_pb2

        quote = request.quote

        try:
            # Get a database session and save the quote
            db = next(get_db())
            try:
                upsert_quote(db, quote)
            finally:
                db.close()

            logger.info("Saved %s at $%.2f", quote.symbol, quote.price)
            return persistence_pb2.PersistResponse(
                success=True,
                symbol=quote.symbol,
                message=f"Saved {quote.symbol}",
            )

        except Exception as e:
            logger.error("Failed to save %s: %s", quote.symbol, e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Database error: {e}")
            return persistence_pb2.PersistResponse(
                success=False,
                symbol=quote.symbol,
                message=str(e),
            )

    async def BulkPersist(self, request, context):
        """Save multiple quotes to the database in parallel."""
        from generated import persistence_pb2

        # Process all quotes concurrently
        tasks = [
            self.Persist(persistence_pb2.PersistRequest(quote=quote), context)
            for quote in request.quotes
        ]
        results = await asyncio.gather(*tasks)

        return persistence_pb2.BulkPersistResponse(results=results)
