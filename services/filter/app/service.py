"""FilterService gRPC servicer implementation."""

import logging
from datetime import datetime, timezone

from trading_lib.config import Config
from trading_lib.db import get_db
from trading_lib.models import Quote

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

            existing = db.query(Quote).filter(Quote.symbol == quote.symbol).first()

            if existing:
                existing.price = quote.price
                existing.open = quote.open
                existing.high = quote.high
                existing.low = quote.low
                existing.volume = quote.volume
                existing.change = quote.change
                existing.change_percent = quote.change_percent
                existing.timestamp = quote.timestamp
                existing.name = quote.name
                existing.exchange = quote.exchange
                existing.currency = quote.currency
                existing.previous_close = quote.previous_close
                existing.is_market_open = quote.is_market_open
                existing.average_volume = quote.average_volume
                existing.fifty_two_week_low = quote.fifty_two_week_low
                existing.fifty_two_week_high = quote.fifty_two_week_high
                existing.day_range_pct = quote.day_range_pct
                existing.fifty_two_week_pct = quote.fifty_two_week_pct
                existing.gap_pct = quote.gap_pct
                existing.volume_ratio = quote.volume_ratio
                existing.intraday_range_pct = quote.intraday_range_pct
                existing.signal = quote.signal
                existing.updated_at = datetime.now(timezone.utc)
                logger.info("Updated existing quote for %s", quote.symbol)
            else:
                db.add(
                    Quote(
                        symbol=quote.symbol,
                        price=quote.price,
                        open=quote.open,
                        high=quote.high,
                        low=quote.low,
                        volume=quote.volume,
                        change=quote.change,
                        change_percent=quote.change_percent,
                        source="pipeline",
                        timestamp=quote.timestamp,
                        name=quote.name,
                        exchange=quote.exchange,
                        currency=quote.currency,
                        previous_close=quote.previous_close,
                        is_market_open=quote.is_market_open,
                        average_volume=quote.average_volume,
                        fifty_two_week_low=quote.fifty_two_week_low,
                        fifty_two_week_high=quote.fifty_two_week_high,
                        day_range_pct=quote.day_range_pct,
                        fifty_two_week_pct=quote.fifty_two_week_pct,
                        gap_pct=quote.gap_pct,
                        volume_ratio=quote.volume_ratio,
                        intraday_range_pct=quote.intraday_range_pct,
                        signal=quote.signal,
                    )
                )
                logger.info("Inserted new quote for %s", quote.symbol)

            db.commit()
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
