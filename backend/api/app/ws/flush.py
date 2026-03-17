"""Background task that flushes dirty Redis quotes to Postgres periodically."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import get_config
from app.db.redis import get_redis
from app.db.session import get_session_factory
from app.db.models import Quote

logger = logging.getLogger(__name__)


async def flush_quotes_loop() -> None:
    """Run forever, flushing dirty quotes from Redis to Postgres."""
    config = get_config()
    interval = config.quote_flush_interval

    while True:
        try:
            await asyncio.sleep(interval)
            await flush_once()
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Quote flush error")


async def flush_once() -> None:
    """Flush all dirty quotes from Redis to Postgres in one batch."""
    redis = await get_redis()

    # pop all dirty tickers atomically
    dirty: set[str] = set()
    while True:
        ticker = await redis.spop("quotes:dirty")
        if ticker is None:
            break
        dirty.add(ticker)

    if not dirty:
        return

    rows: list[dict] = []
    for ticker in dirty:
        data = await redis.hgetall(f"quote:{ticker}")
        if not data:
            continue

        rows.append(
            {
                "ticker": ticker,
                "price": _float(data.get("price")),
                "bid_price": _float(data.get("bid_price")),
                "ask_price": _float(data.get("ask_price")),
                "change": _float(data.get("change")),
                "change_percent": _float(data.get("change_percent")),
                "timestamp": _int(data.get("timestamp")),
                "source": data.get("source", "mock"),
            }
        )

    if not rows:
        return

    # upsert into Postgres quote table
    session = get_session_factory()()
    try:
        stmt = pg_insert(Quote.__table__).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["ticker"],
            set_={
                "price": stmt.excluded.price,
                "bid_price": stmt.excluded.bid_price,
                "ask_price": stmt.excluded.ask_price,
                "change": stmt.excluded.change,
                "change_percent": stmt.excluded.change_percent,
                "timestamp": stmt.excluded.timestamp,
                "source": stmt.excluded.source,
            },
        )
        session.execute(stmt)
        session.commit()
        logger.info("Flushed %d quotes to Postgres", len(rows))
    except Exception:
        session.rollback()
        logger.exception("Failed to flush quotes")
    finally:
        session.close()


def _float(val: str | None) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _int(val: str | None) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except ValueError:
        return None
