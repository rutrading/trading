"""gRPC client for the FastAPI gateway to call the pipeline services."""

import logging
import sys
from pathlib import Path

from trading_lib.channel import create_channel
from trading_lib.config import Config, get_config

logger = logging.getLogger(__name__)

# Add the generated code to the path
_generated_dir = Path(__file__).resolve().parent.parent / "generated"
if str(_generated_dir) not in sys.path:
    sys.path.insert(0, str(_generated_dir))


class PipelineClient:
    """gRPC client that orchestrates calls through the pipeline."""

    def __init__(self, config: Config) -> None:
        self.config = config

        self.market_data_channel = create_channel(config.market_data_host)
        self.transformer_channel = create_channel(config.transformer_host)
        self.filter_channel = create_channel(config.filter_host)

        from generated import (
            filter_pb2_grpc,
            market_data_pb2_grpc,
            transformer_pb2_grpc,
        )

        self.market_data_stub = market_data_pb2_grpc.MarketDataServiceStub(
            self.market_data_channel
        )
        self.transformer_stub = transformer_pb2_grpc.TransformerServiceStub(
            self.transformer_channel
        )
        self.filter_stub = filter_pb2_grpc.FilterServiceStub(self.filter_channel)

    async def fetch_quote(self, symbol: str):
        """Run a symbol through the full pipeline: fetch -> transform -> filter.

        Returns the TransformResponse on success, or None on failure.
        """
        from generated import (
            filter_pb2,
            market_data_pb2,
            transformer_pb2,
        )

        try:
            # Step 1: Fetch from MarketData
            quote_request = market_data_pb2.QuoteRequest(symbol=symbol)
            raw_quote = await self.market_data_stub.GetQuote(quote_request, timeout=10)

            # Step 2: Transform
            transform_request = transformer_pb2.TransformRequest(raw_quote=raw_quote)
            transformed = await self.transformer_stub.Transform(
                transform_request, timeout=5
            )

            # Step 3: Filter and persist (fire and forget the persistence,
            # but we still await to get the response)
            filter_request = filter_pb2.FilterRequest(quote=transformed)
            await self.filter_stub.Process(filter_request, timeout=5)

            return transformed

        except Exception as e:
            logger.error("Pipeline error for %s: %s", symbol, e)
            return None


_client: PipelineClient | None = None


def get_pipeline_client() -> PipelineClient:
    """FastAPI dependency that returns a singleton PipelineClient."""
    global _client
    if _client is None:
        _client = PipelineClient(get_config())
    return _client
