"""ATR (Average True Range) computation service.

Computes the n-period ATR for a ticker using daily bars from the DB.
Falls back to a synchronous Alpaca fetch when the DB doesn't have enough data.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.config import get_config
from app.db.models import DailyBar

logger = logging.getLogger(__name__)

ATR_PERIODS = 14  # standard 14-period ATR


def compute_atr(ticker: str, db: Session, n: int = ATR_PERIODS) -> Decimal:
    """Return the n-period ATR for ticker.

    Queries the DB first. If fewer than n+1 daily bars exist, fetches from
    Alpaca synchronously and stores nothing (read-only fallback). Returns
    Decimal("0") if data is unavailable — callers fall back to the percentage
    buffer in that case.
    """
    bars = (
        db.query(DailyBar)
        .filter(DailyBar.ticker == ticker)
        .order_by(DailyBar.date.desc())
        .limit(n + 1)
        .all()
    )
    bars = list(reversed(bars))  # oldest first

    if len(bars) >= n + 1:
        return _atr_from_db_bars(bars, n)

    # DB doesn't have enough bars — fetch from Alpaca synchronously
    logger.debug("Not enough daily bars for %s in DB (%d), fetching from Alpaca", ticker, len(bars))
    raw = _fetch_bars_sync(ticker, n + 5)  # extra buffer for weekends/holidays
    if len(raw) >= n + 1:
        return _atr_from_raw_bars(raw, n)

    logger.warning("Insufficient bar data for ATR on %s — using 0 (percentage buffer only)", ticker)
    return Decimal("0")


def _atr_from_db_bars(bars: list, n: int) -> Decimal:
    """Compute ATR from a list of DailyBar ORM objects (oldest first)."""
    trs: list[Decimal] = []
    for i in range(1, len(bars)):
        prev_close = Decimal(str(bars[i - 1].close))
        high = Decimal(str(bars[i].high))
        low = Decimal(str(bars[i].low))
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)
    return sum(trs[-n:]) / n


def _atr_from_raw_bars(raw: list[dict], n: int) -> Decimal:
    """Compute ATR from a list of raw Alpaca bar dicts (oldest first).

    Alpaca bar keys: t (time), o, h, l, c, v.
    """
    trs: list[Decimal] = []
    for i in range(1, len(raw)):
        prev_close = Decimal(str(raw[i - 1]["c"]))
        high = Decimal(str(raw[i]["h"]))
        low = Decimal(str(raw[i]["l"]))
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)
    return sum(trs[-n:]) / n


def _fetch_bars_sync(ticker: str, limit: int) -> list[dict]:
    """Synchronous Alpaca daily bar fetch using httpx.Client.

    Returns raw Alpaca bar dicts sorted oldest first, or [] on any error.
    """
    config = get_config()
    headers = {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }
    end = date.today().isoformat()
    # Fetch extra calendar days to account for weekends and holidays
    start = (date.today() - timedelta(days=limit * 2)).isoformat()
    url = f"{config.alpaca_data_base_url}/v2/stocks/{ticker}/bars"
    params = {
        "timeframe": "1Day",
        "start": start,
        "end": end,
        "limit": limit,
        "feed": config.alpaca_feed,
    }
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            return resp.json().get("bars", [])
    except Exception:
        logger.exception("Failed to fetch Alpaca bars for ATR on %s", ticker)
        return []
