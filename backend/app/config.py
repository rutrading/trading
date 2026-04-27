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
    log_level: str = "INFO"
    allow_symbol_seed_endpoint: bool = False
    symbol_seed_on_startup: bool = True
    symbol_seed_refresh_interval_seconds: int = 86400
    news_refresh_interval_seconds: int = 900
    kalshi_api_key_id: str = ""
    kalshi_private_key_pem: str = ""
    kalshi_api_origin: str = "https://demo-api.kalshi.co"
    kalshi_api_prefix: str = "/trade-api/v2"
    kalshi_btc_series_ticker: str = "KXBTCD"
    kalshi_rate_limit: int = 60
    kalshi_poll_interval_seconds: int = 30
    kalshi_default_strategy: str = "threshold_drift"
    kalshi_max_orders_per_cycle: int = 1
    kalshi_max_open_contracts: int = 5
    kalshi_order_time_in_force: str = "immediate_or_cancel"


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def get_config() -> Config:
    kwargs: dict = {}
    for f in fields(Config):
        env_val = os.getenv(f.name.upper())
        if env_val is not None:
            if isinstance(f.default, bool):
                kwargs[f.name] = env_val.lower() in ("1", "true", "yes", "on")
            elif isinstance(f.default, int):
                kwargs[f.name] = int(env_val)
            else:
                kwargs[f.name] = env_val
    return Config(**kwargs)
