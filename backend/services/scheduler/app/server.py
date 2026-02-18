"""Scheduler entrypoint."""

import asyncio

from trading_lib import bootstrap

from app.service import Scheduler


async def main() -> None:
    config = bootstrap(__file__)

    scheduler = Scheduler(config)
    await scheduler.run()


if __name__ == "__main__":
    asyncio.run(main())
