"""FilterService gRPC servicer implementation."""

import logging

from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.utils import upsert_quote

logger = logging.getLogger(__name__)


class FilterServicer:
    """Filters relevant data and persists to the database."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def Process(self, request, context):
        """Filter and persist a single transformed quote."""
        from generated import filter_pb2

        quote = request.quote
        logger.info(
            "Processing %s: price=%.2f change=%.4f change_pct=%.4f%%",
            quote.symbol,
            quote.price,
            quote.change,
            quote.change_percent,
        )

        try:
            db = next(get_db())
            try:
                upsert_quote(db, quote)
            finally:
                db.close()

            logger.info("Persisted quote for %s at $%.2f", quote.symbol, quote.price)

            return filter_pb2.ProcessResponse(
                persisted=True,
                symbol=quote.symbol,
                message=f"Persisted {quote.symbol} at {quote.price}",
            )
        except Exception as e:
            logger.error("Failed to persist %s: %s", quote.symbol, e)
            return filter_pb2.ProcessResponse(
                persisted=False,
                symbol=quote.symbol,
                message=str(e),
            )

    async def BulkProcess(self, request, context):
        """Filter and persist multiple transformed quotes."""
        from generated import filter_pb2

        results = []
        for quote in request.quotes:
            req = filter_pb2.ProcessRequest(quote=quote)
            result = await self.Process(req, context)
            results.append(result)

        return filter_pb2.BulkProcessResponse(results=results)
