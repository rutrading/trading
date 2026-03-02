import logging
import time

from trading_lib.config import Config, get_config
from trading_lib.pipeline import MarketDataClient, persist_quote, transform_quote

logger = logging.getLogger(__name__)


class PipelineClient:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.market_data = MarketDataClient(config)

    async def fetch_quote(self, symbol: str):
        start = time.perf_counter_ns()

        fetch_start = time.perf_counter_ns()
        raw_quote = await self.market_data.fetch_quote(symbol)
        fetch_ms = (time.perf_counter_ns() - fetch_start) / 1_000_000

        transform_start = time.perf_counter_ns()
        transformed = transform_quote(raw_quote)
        transform_ms = (time.perf_counter_ns() - transform_start) / 1_000_000

        persist_start = time.perf_counter_ns()
        try:
            persist_quote(transformed)
        except Exception as exc:
            logger.warning("persist skipped for %s: %s", symbol, exc)
        persist_ms = (time.perf_counter_ns() - persist_start) / 1_000_000

        total_ms = (time.perf_counter_ns() - start) / 1_000_000
        logger.info(
            "%s pipeline: %.1fms total | fetch=%.1fms transform=%.1fms persist=%.1fms",
            symbol,
            total_ms,
            fetch_ms,
            transform_ms,
            persist_ms,
        )

        return transformed


_client: PipelineClient | None = None


async def get_pipeline_client() -> PipelineClient:
    global _client
    if _client is None:
        _client = PipelineClient(get_config())
    return _client
