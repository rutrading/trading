"""Shared configuration for all gRPC services."""

import os
from dataclasses import dataclass, fields


@dataclass(frozen=True)
class Config:
    # Database connection
    database_url: str = "postgresql://postgres:postgres@localhost:5432/trading"

    # Service hosts (host:port format)
    market_data_host: str = "localhost:50051"
    transformer_host: str = "localhost:50052"
    persistence_host: str = "localhost:50053"

    # External API config
    twelve_data_api_key: str = ""
    twelve_data_base_url: str = "https://api.twelvedata.com"
    twelve_data_rate_limit: int = 8  # calls per minute (free tier)

    # Caching
    quote_staleness_seconds: int = 60

    # Logging
    log_level: str = "INFO"


def get_config() -> Config:
    """Load configuration from environment variables.

    Convention: each dataclass field maps to an uppercased env var
    (e.g. ``database_url`` -> ``DATABASE_URL``).  The field's default
    value is used as the fallback, and its type determines coercion.
    """
    kwargs: dict = {}
    for f in fields(Config):
        env_val = os.getenv(f.name.upper())
        if env_val is not None:
            # Coerce to the field's type based on its default value
            if isinstance(f.default, int):
                kwargs[f.name] = int(env_val)
            else:
                kwargs[f.name] = env_val
    return Config(**kwargs)
