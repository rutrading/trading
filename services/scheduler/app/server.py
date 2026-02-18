"""Scheduler entrypoint."""

import asyncio
import logging
from pathlib import Path

from dotenv import load_dotenv

from trading_lib import get_config

from app.service import Scheduler

# Load .env from this service's directory, not cwd
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


async def main() -> None:
    config = get_config()
    logging.basicConfig(level=config.log_level)

    scheduler = Scheduler(config)
    await scheduler.run()


if __name__ == "__main__":
    asyncio.run(main())
