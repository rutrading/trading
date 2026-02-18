import logging
from pathlib import Path

from dotenv import load_dotenv

from trading_lib.channel import create_channel
from trading_lib.config import Config, get_config
from trading_lib.server import create_server

__all__ = ["Config", "bootstrap", "create_channel", "create_server", "get_config"]


def bootstrap(caller_file: str) -> Config:
    """One-call setup for any service or the API gateway.

    - Loads ``.env`` from the service's own directory (derived from *caller_file*).
    - Configures logging with millisecond timestamps.
    - Returns a :class:`Config` populated from environment variables.

    Usage in every ``server.py`` / ``main.py``::

        from trading_lib import bootstrap
        config = bootstrap(__file__)
    """
    service_dir = Path(caller_file).resolve().parent.parent
    load_dotenv(service_dir / ".env")

    config = get_config()

    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    return config
