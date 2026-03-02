import logging
from pathlib import Path

from dotenv import load_dotenv

from app.config import Config, get_config


def bootstrap(caller_file: str) -> Config:
    service_dir = Path(caller_file).resolve().parent.parent
    load_dotenv(service_dir / ".env")

    config = get_config()
    logging.basicConfig(
        level=config.log_level,
        format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    return config
