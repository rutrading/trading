"""Shared configuration for all gRPC services."""

import os
from dataclasses import dataclass, fields


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
