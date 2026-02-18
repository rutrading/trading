"""TransformerService gRPC servicer implementation."""

import logging

from trading_lib.config import Config

logger = logging.getLogger(__name__)


class TransformerServicer:
    """Normalizes and enriches raw market data."""

    def __init__(self, config: Config) -> None:
        self.config = config

    async def Transform(self, request, context):
        """Transform a single raw quote into a normalized format."""
        from generated import transformer_pb2

        raw = request.raw_quote
        logger.info("Transforming quote for %s", raw.symbol)

        change = raw.price - raw.open if raw.open else 0.0
        change_percent = (change / raw.open * 100) if raw.open else 0.0

        return transformer_pb2.TransformResponse(
            symbol=raw.symbol,
            price=raw.price,
            change=round(change, 4),
            change_percent=round(change_percent, 4),
            open=raw.open,
            high=raw.high,
            low=raw.low,
            volume=raw.volume,
            timestamp=raw.timestamp,
        )

    async def BulkTransform(self, request, context):
        """Transform multiple raw quotes."""
        from generated import transformer_pb2

        results = []
        for raw_quote in request.raw_quotes:
            req = transformer_pb2.TransformRequest(raw_quote=raw_quote)
            result = await self.Transform(req, context)
            results.append(result)

        return transformer_pb2.BulkTransformResponse(quotes=results)
