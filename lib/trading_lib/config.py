"""Shared configuration for all gRPC services."""

import os
from dataclasses import dataclass, field

from dotenv import load_dotenv


@dataclass(frozen=True)
class Config:
    database_url: str = "postgresql://postgres:postgres@localhost:5432/trading"
    market_data_host: str = "localhost:50051"
    transformer_host: str = "localhost:50052"
    filter_host: str = "localhost:50053"
    scheduler_host: str = "localhost:50054"
    twelve_data_api_key: str = ""
    twelve_data_base_url: str = "https://api.twelvedata.com"
    quote_staleness_seconds: int = 60
    scheduler_symbols: str = ""
    log_level: str = "INFO"


def get_config() -> Config:
    """Load configuration from environment variables."""
    load_dotenv()
    return Config(
        database_url=os.getenv("DATABASE_URL", Config.database_url),
        market_data_host=os.getenv("MARKET_DATA_HOST", Config.market_data_host),
        transformer_host=os.getenv("TRANSFORMER_HOST", Config.transformer_host),
        filter_host=os.getenv("FILTER_HOST", Config.filter_host),
        scheduler_host=os.getenv("SCHEDULER_HOST", Config.scheduler_host),
        twelve_data_api_key=os.getenv(
            "TWELVE_DATA_API_KEY", Config.twelve_data_api_key
        ),
        twelve_data_base_url=os.getenv(
            "TWELVE_DATA_BASE_URL", Config.twelve_data_base_url
        ),
        quote_staleness_seconds=int(
            os.getenv("QUOTE_STALENESS_SECONDS", str(Config.quote_staleness_seconds))
        ),
        scheduler_symbols=os.getenv("SCHEDULER_SYMBOLS", Config.scheduler_symbols),
        log_level=os.getenv("LOG_LEVEL", Config.log_level),
    )
