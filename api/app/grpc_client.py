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
        self._market_data_stub = None
        self._transformer_stub = None
        self._filter_stub = None

    def _ensure_stubs(self) -> None:
        """Lazily create channels and stubs on the asyncio event loop."""
        if self._market_data_stub is not None:
            return

        from generated import (
            filter_pb2_grpc,
            market_data_pb2_grpc,
            transformer_pb2_grpc,
        )

        self._market_data_stub = market_data_pb2_grpc.MarketDataServiceStub(
            create_channel(self.config.market_data_host)
        )
        self._transformer_stub = transformer_pb2_grpc.TransformerServiceStub(
            create_channel(self.config.transformer_host)
        )
        self._filter_stub = filter_pb2_grpc.FilterServiceStub(
            create_channel(self.config.filter_host)
        )

    async def fetch_quote(self, symbol: str):
        """Run a symbol through the full pipeline: fetch -> transform -> filter.

        Returns the TransformResponse on success, or None on failure.
        """
        self._ensure_stubs()

        from generated import (
            filter_pb2,
            market_data_pb2,
            transformer_pb2,
        )

        try:
            # Step 1: Fetch from MarketData
            quote_request = market_data_pb2.QuoteRequest(symbol=symbol)
            raw_quote = await self._market_data_stub.GetQuote(quote_request, timeout=3)

            # Step 2: Transform
            transform_request = transformer_pb2.TransformRequest(raw_quote=raw_quote)
            transformed = await self._transformer_stub.Transform(
                transform_request, timeout=2
            )

            # Step 3: Filter and persist
            filter_request = filter_pb2.FilterRequest(quote=transformed)
            await self._filter_stub.Process(filter_request, timeout=2)

            return transformed

        except Exception as e:
            logger.error("Pipeline error for %s: %s", symbol, e)
            return None


_client: PipelineClient | None = None


async def get_pipeline_client() -> PipelineClient:
    """FastAPI dependency that returns a singleton PipelineClient."""
    global _client
    if _client is None:
        _client = PipelineClient(get_config())
    return _client
