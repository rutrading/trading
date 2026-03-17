import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.db.redis import get_redis, close_redis
from app.ws.manager import ConnectionManager
from app.ws.alpaca_feed import AlpacaFeed
from app.ws.router import router as ws_router, set_manager
from app.ws.flush import flush_quotes_loop

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

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
config = get_config()
logging.basicConfig(
    level=config.log_level,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

logger = logging.getLogger(__name__)

manager = ConnectionManager()
feed = AlpacaFeed(manager, config)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_redis()
    logger.info("Redis connected")

    set_manager(manager)
    await feed.start()

    flush_task = asyncio.create_task(flush_quotes_loop())
    logger.info("Quote flush task started")

    yield

    await feed.stop()
    flush_task.cancel()
    try:
        await flush_task
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
