import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.db.redis import close_redis, get_redis
from app.routers import (
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
from app.ws.feeds.alpaca import AlpacaFeed
from app.ws.feeds.base import BaseFeed
from app.ws.flush import flush_quotes_loop
from app.ws.manager import ConnectionManager
from app.ws.feeds.mock import MockFeed
from app.tasks.order_executor import run_order_executor
from app.ws.router import router as ws_router, set_manager

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
    if not _has_alpaca_credentials():
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
