"""Historical bar service layer."""

import logging
from datetime import datetime, date, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import get_config
from app.db.models import DailyBar
from app.rate_limit import get_alpaca_limiter

logger = logging.getLogger(__name__)

INTRADAY_TIMEFRAMES = {"1Min", "5Min", "15Min", "30Min", "1Hour"}
DAILY_TIMEFRAME = "1Day"
AGGREGATED_TIMEFRAMES = {"1Week", "1Month", "3Month", "6Month", "1Year"}


def parse_iso_utc(value: str) -> datetime:
    """Parse an ISO-8601 string into a timezone-aware UTC datetime."""
    if not value:
        raise ValueError("missing ISO datetime")
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _alpaca_headers() -> dict[str, str]:
    config = get_config()
    return {
        "APCA-API-KEY-ID": config.alpaca_api_key,
        "APCA-API-SECRET-KEY": config.alpaca_secret_key,
    }


def _transform_bars(raw_bars: list[dict]) -> list[dict]:
    """Convert Alpaca bar dicts into our normalized format."""
    result = []
    for bar in raw_bars:
        try:
            ts = int(parse_iso_utc(str(bar.get("t", ""))).timestamp())
        except ValueError:
            continue
        result.append(
            {
                "time": ts,
                "open": float(bar.get("o", 0)),
                "high": float(bar.get("h", 0)),
                "low": float(bar.get("l", 0)),
                "close": float(bar.get("c", 0)),
                "volume": float(bar.get("v", 0)),
                "vwap": float(bar.get("vw", 0)),
                "trade_count": int(bar.get("n", 0)),
            }
        )
    return result


async def _fetch_alpaca_bars(
    ticker: str,
    timeframe: str,
    start: str,
    end: str,
) -> list[dict]:
    """Paginated fetch of bars from Alpaca REST. Returns raw Alpaca bar dicts."""
    config = get_config()
    limiter = get_alpaca_limiter()
    headers = _alpaca_headers()

    is_crypto = "/" in ticker
    if is_crypto:
        base_path = f"/v1beta3/crypto/us/bars"
        extra_params = {"symbols": ticker}
    else:
        base_path = f"/v2/stocks/{ticker}/bars"
        extra_params = {"feed": config.alpaca_feed}

    all_bars: list[dict] = []
    page_token: str | None = None
    seen_tokens: set[str] = set()

    async with httpx.AsyncClient(
        base_url=config.alpaca_data_base_url, timeout=20.0
    ) as client:
        while True:
            params = {
                "timeframe": timeframe,
                "start": start,
                "end": end,
                "adjustment": "raw",
                "sort": "asc",
                "limit": 10000,
                **extra_params,
            }
            if page_token:
                params["page_token"] = page_token

            await limiter.acquire()
            response = await client.get(
                base_path,
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            body = response.json()

            if is_crypto:
                bars_list = body.get("bars", {}).get(ticker, [])
            else:
                bars_list = body.get("bars", [])

            all_bars.extend(bars_list)

            next_token = body.get("next_page_token")
            if not next_token:
                break
            if next_token in seen_tokens:
                logger.warning(
                    "Repeating page token for %s, stopping pagination", ticker
                )
                break
            seen_tokens.add(next_token)
            page_token = next_token

    return all_bars


async def fetch_intraday_bars(
    ticker: str, timeframe: str, start: str, end: str
) -> list[dict]:
    """Fetch intraday bars from Alpaca REST. Never stored in DB."""
    raw = await _fetch_alpaca_bars(ticker, timeframe, start, end)
    return _transform_bars(raw)


async def fetch_daily_bars(
    db: Session, ticker: str, start: str, end: str
) -> list[dict]:
    """Fetch daily bars from the daily_bar table, backfilling gaps from Alpaca."""
    start_date = parse_iso_utc(start).date()
    end_date = parse_iso_utc(end).date()

    existing_rows = (
        db.query(DailyBar)
        .filter(
            DailyBar.ticker == ticker,
            DailyBar.date >= start_date,
            DailyBar.date <= end_date,
        )
        .order_by(DailyBar.date)
        .all()
    )

    existing_dates = {row.date for row in existing_rows}

    should_backfill = len(existing_rows) == 0 or (
        end_date > start_date and (end_date - start_date).days > len(existing_rows) * 2
    )

    if should_backfill:
        raw = await _fetch_alpaca_bars(ticker, "1Day", start, end)

        if raw:
            new_rows = []
            for bar in raw:
                try:
                    bar_date = parse_iso_utc(str(bar.get("t", ""))).date()
                except ValueError:
                    continue

                if bar_date in existing_dates:
                    continue

                new_rows.append(
                    DailyBar(
                        ticker=ticker,
                        date=bar_date,
                        open=float(bar.get("o", 0)),
                        high=float(bar.get("h", 0)),
                        low=float(bar.get("l", 0)),
                        close=float(bar.get("c", 0)),
                        volume=float(bar.get("v", 0)),
                        trade_count=int(bar.get("n", 0)),
                        vwap=float(bar.get("vw", 0)),
                    )
                )

            if new_rows:
                stmt = pg_insert(DailyBar).values(
                    [
                        {
                            "ticker": row.ticker,
                            "date": row.date,
                            "open": row.open,
                            "high": row.high,
                            "low": row.low,
                            "close": row.close,
                            "volume": row.volume,
                            "trade_count": row.trade_count,
                            "vwap": row.vwap,
                        }
                        for row in new_rows
                    ]
                )
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["ticker", "date"],
                )
                db.execute(stmt)
                db.commit()
                logger.info("Backfilled %d daily bars for %s", len(new_rows), ticker)

        existing_rows = (
            db.query(DailyBar)
            .filter(
                DailyBar.ticker == ticker,
                DailyBar.date >= start_date,
                DailyBar.date <= end_date,
            )
            .order_by(DailyBar.date)
            .all()
        )

    result = []
    for row in existing_rows:
        d = row.date
        if isinstance(d, date):
            ts = int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())
        else:
            ts = int(parse_iso_utc(str(d)).timestamp())
        result.append(
            {
                "time": ts,
                "open": row.open,
                "high": row.high,
                "low": row.low,
                "close": row.close,
                "volume": row.volume,
                "vwap": row.vwap,
                "trade_count": row.trade_count,
            }
        )

    return result


async def fetch_aggregated_bars(
    db: Session, ticker: str, period: str, start: str, end: str
) -> list[dict]:
    """Aggregate daily bars into weekly/monthly/quarterly via SQL."""
    await fetch_daily_bars(db, ticker, start, end)

    start_date = parse_iso_utc(start).date()
    end_date = parse_iso_utc(end).date()

    if period == "6Month":
        group_expr = (
            "date_trunc('year', date)"
            " + INTERVAL '6 months' * FLOOR((EXTRACT(month FROM date)::int - 1) / 6)"
        )
    else:
        trunc_map = {
            "1Week": "week",
            "1Month": "month",
            "3Month": "quarter",
            "1Year": "year",
        }
        trunc = trunc_map.get(period, "month")
        group_expr = f"date_trunc('{trunc}', date)"

    sql = text(f"""
        SELECT
            {group_expr} AS period,
            (array_agg(open ORDER BY date))[1] AS open,
            MAX(high) AS high,
            MIN(low) AS low,
            (array_agg(close ORDER BY date DESC))[1] AS close,
            SUM(volume) AS volume,
            SUM(trade_count) AS trade_count
        FROM daily_bar
        WHERE ticker = :ticker AND date >= :start AND date <= :end
        GROUP BY period
        ORDER BY period
    """)

    rows = db.execute(
        sql,
        {"ticker": ticker, "start": start_date, "end": end_date},
    ).fetchall()

    result = []
    for row in rows:
        period_dt = row[0]
        ts = int(period_dt.timestamp()) if period_dt else 0
        result.append(
            {
                "time": ts,
                "open": float(row[1] or 0),
                "high": float(row[2] or 0),
                "low": float(row[3] or 0),
                "close": float(row[4] or 0),
                "volume": float(row[5] or 0),
                "trade_count": int(row[6] or 0),
            }
        )

    return result
