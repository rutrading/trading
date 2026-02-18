"""Scheduler entrypoint."""

import asyncio
import logging

from trading_lib import get_config

from app.service import Scheduler


async def main() -> None:
    config = get_config()
    logging.basicConfig(level=config.log_level)

    scheduler = Scheduler(config)
    await scheduler.run()


if __name__ == "__main__":
    asyncio.run(main())
