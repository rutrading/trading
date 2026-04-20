import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.db.redis import close_redis, get_redis
from app.routers import (
    accounts,
    company,
    health,
    historical_bars,
    holdings,
    news,
    orders,
    quotes,
    symbols,
    transactions,
    watchlist,
)
from app.tasks.order_executor import run_order_executor
from app.ws.feeds.alpaca import AlpacaFeed
from app.ws.feeds.base import BaseFeed
from app.ws.feeds.mock import MockFeed
from app.ws.flush import flush_quotes_loop
from app.ws.manager import ConnectionManager
from app.ws.router import router as ws_router
from app.ws.router import set_manager

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
config = get_config()
logging.basicConfig(
    level=config.log_level,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)


def _has_alpaca_credentials() -> bool:
    key = (config.alpaca_api_key or "").strip()
    secret = (config.alpaca_secret_key or "").strip()
    return key not in {"", "your_alpaca_key_here"} and secret not in {
        "",
        "your_alpaca_secret_here",
    }


async def _log_alpaca_account_info() -> None:
    """Best-effort startup call to Alpaca /v2/account. Logs account status
    plus the per-minute rate-limit headers so you know the tier at a glance.
    Swallows all errors — must never block startup."""
    try:
        async with httpx.AsyncClient(
            base_url=config.alpaca_base_url, timeout=5.0
        ) as client:
            res = await client.get(
                "/v2/account",
                headers={
                    "APCA-API-KEY-ID": config.alpaca_api_key,
                    "APCA-API-SECRET-KEY": config.alpaca_secret_key,
                },
            )
            if res.status_code != 200:
                logger.warning(
                    "Alpaca /v2/account returned %s: %s",
                    res.status_code,
                    res.text[:200],
                )
                return

            body = res.json()
            rate_limit = res.headers.get("X-Ratelimit-Limit", "?")
            rate_remaining = res.headers.get("X-Ratelimit-Remaining", "?")

            logger.info(
                "Alpaca account: status=%s rate_limit=%s/min (remaining=%s)",
                body.get("status", "?"),
                rate_limit,
                rate_remaining,
            )
    except Exception as exc:
        logger.warning("Alpaca account info lookup failed: %s", exc)


manager = ConnectionManager()
feed: BaseFeed
if _has_alpaca_credentials():
    feed = AlpacaFeed(manager, config)
else:
    feed = MockFeed(manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    logger.info("Redis connected")

    set_manager(manager)
    if _has_alpaca_credentials():
        await _log_alpaca_account_info()
    else:
        logger.warning(
            "Alpaca credentials not set, using mock market-data feed for local development."
        )

    await feed.start()

    flush_task = asyncio.create_task(flush_quotes_loop())
    logger.info("Quote flush task started")

    executor_task = asyncio.create_task(run_order_executor())

    yield

    await feed.stop()
    flush_task.cancel()
    executor_task.cancel()
    try:
        await flush_task
    except asyncio.CancelledError:
        pass
    try:
        await executor_task
    except asyncio.CancelledError:
        pass
    await close_redis()
    logger.info("Shutdown complete")


app = FastAPI(title="R U Trading API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)
app.include_router(health.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(historical_bars.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(holdings.router, prefix="/api")
app.include_router(symbols.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(watchlist.router, prefix="/api")
app.include_router(news.router, prefix="/api")
app.include_router(company.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
