import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import AUTH_SERVER_URL, SKIP_AUTH
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
from app.tasks.get_news import run_news_loop
from app.ws.feeds.alpaca import AlpacaFeed
from app.ws.feeds.base import BaseFeed
from app.ws.feeds.mock import MockFeed
from app.ws.flush import flush_quotes_loop
from app.ws.manager import ConnectionManager
from app.ws.router import router as ws_router
from app.ws.router import set_manager

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
config = get_config()

# Restore the structured log format that earlier commits removed — order
# placement, fills, and ticker-churn logs are noisy enough that triage needs
# a timestamp + level + module prefix on every line.
logging.basicConfig(
    level=config.log_level,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


class _HealthcheckAccessFilter(logging.Filter):
    """Drop uvicorn access lines for the health endpoint.

    The platform pings /api/health every couple of seconds, which buries every
    other request under a wall of 200 OK lines. We still want access logs for
    everything else, so filter at the record level instead of disabling the
    access logger entirely.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        return "/api/health" not in message


logging.getLogger("uvicorn.access").addFilter(_HealthcheckAccessFilter())


_LOCALHOST_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}


def _is_localhost_url(url: str | None) -> bool:
    """Return True iff the URL's host resolves to a loopback address.

    Used to gate the SKIP_AUTH bypass so it cannot be deployed alongside a
    real database or auth server. Postgres URLs are also accepted in their
    unix-socket-less ``postgresql://user:pass@host/db`` shape.
    """
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    return host in _LOCALHOST_HOSTS


def _enforce_skip_auth_safety() -> None:
    """Refuse to start when SKIP_AUTH=true is combined with non-localhost
    DATABASE_URL or AUTH_SERVER_URL. SKIP_AUTH disables every membership
    check and short-circuits the trading-account authorization layer; it
    must never run pointed at a non-local datastore.

    Set SKIP_AUTH_ALLOW_NON_LOCALHOST=1 to bypass this check (e.g. for an
    internal dev environment running against a remote test DB). The bypass
    logs at CRITICAL so the choice shows up in any operational log review.
    """
    if not SKIP_AUTH:
        return

    db_local = _is_localhost_url(config.database_url)
    auth_local = _is_localhost_url(AUTH_SERVER_URL)
    if db_local and auth_local:
        return

    bypass = os.environ.get("SKIP_AUTH_ALLOW_NON_LOCALHOST", "").lower() in ("1", "true")
    message = (
        "Refusing to start: SKIP_AUTH=true is set but DATABASE_URL or "
        f"AUTH_SERVER_URL is not on localhost (database_url_host_local={db_local}, "
        f"auth_server_url_host_local={auth_local}). "
        "SKIP_AUTH disables all authentication and account-membership checks; "
        "running it against a real datastore exposes every account to anonymous "
        "callers. Either unset SKIP_AUTH or set SKIP_AUTH_ALLOW_NON_LOCALHOST=1 "
        "to confirm this was intentional."
    )
    if bypass:
        logger.critical("%s SKIP_AUTH_ALLOW_NON_LOCALHOST=1 — proceeding anyway.", message)
        return
    raise RuntimeError(message)


_enforce_skip_auth_safety()


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

    symbol_sync_task = asyncio.create_task(symbols.run_symbol_sync_loop())
    logger.info("Symbol sync task started")

    flush_task = asyncio.create_task(flush_quotes_loop())
    logger.info("Quote flush task started")

    executor_task = asyncio.create_task(run_order_executor())
    news_task = asyncio.create_task(run_news_loop())
    logger.info("News refresh task started")

    yield

    await feed.stop()
    symbol_sync_task.cancel()
    flush_task.cancel()
    executor_task.cancel()
    news_task.cancel()
    try:
        await symbol_sync_task
    except asyncio.CancelledError:
        pass
    try:
        await flush_task
    except asyncio.CancelledError:
        pass
    try:
        await executor_task
    except asyncio.CancelledError:
        pass
    try:
        await news_task
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
