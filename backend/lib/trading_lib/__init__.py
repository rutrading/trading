"""Trading library shared by API and backend helpers."""

import logging
from pathlib import Path

from dotenv import load_dotenv

from trading_lib.config import Config, get_config
from trading_lib.db import db_session

__all__ = [
    "Config",
    "bootstrap",
    "db_session",
    "get_config",
]


def bootstrap(caller_file: str) -> Config:
    """One-call setup for any service.

    This function:
    1. Loads .env file from the service's directory
    2. Configures logging with timestamps
    3. Returns a Config object with all settings

    Usage:
        config = bootstrap(__file__)
    """
    # Find the service's root directory (parent of app/)
    service_dir = Path(caller_file).resolve().parent.parent
    load_dotenv(service_dir / ".env")

    config = get_config()

    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    return config
