import os
from dataclasses import dataclass, fields


@dataclass(frozen=True)
class Config:
    database_url: str = "postgresql://postgres:postgres@localhost:5432/trading"
    redis_url: str = "redis://localhost:6379/0"
    alpaca_api_key: str = ""
    alpaca_secret_key: str = ""
    alpaca_base_url: str = "https://api.alpaca.markets"
    alpaca_data_base_url: str = "https://data.alpaca.markets"
    alpaca_feed: str = "iex"
    alpaca_rate_limit: int = 200
    alpaca_ws_stocks_url: str = "wss://stream.data.alpaca.markets/v2/iex"
    alpaca_ws_crypto_url: str = "wss://stream.data.alpaca.markets/v1beta3/crypto/us"
    alpaca_ws_symbol_limit: int = 30
    alpha_vantage_api_key: str = ""
    alpha_vantage_url: str = "https://www.alphavantage.co/query"
    fmp_api_key: str = ""
    fmp_base_url: str = "https://financialmodelingprep.com/api/v3"
    quote_staleness_seconds: int = 60
    quote_flush_interval: int = 30
    strategy_poll_interval: int = 30
    strategy_executor_enabled: int = 1
    log_level: str = "INFO"


def get_config() -> Config:
    kwargs: dict = {}
    for f in fields(Config):
        env_val = os.getenv(f.name.upper())
        if env_val is not None:
            if isinstance(f.default, int):
                kwargs[f.name] = int(env_val)
            else:
                kwargs[f.name] = env_val
    return Config(**kwargs)
