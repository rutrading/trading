"""Shared utilities for all gRPC services and the API gateway."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# US market hours in UTC (ET + 5 during EST, ET + 4 during EDT).
# Using EST (winter) offsets as a safe approximation.
MARKET_OPEN_HOUR = 14  # 9:30 AM ET = 14:30 UTC
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 21  # 4:00 PM ET = 21:00 UTC

# Fields shared between the Quote model, protobuf TransformResponse, and
# the JSON dict returned by the API.  Every service that reads or writes
# quote data iterates over this list instead of hand-coding 22 field names.
QUOTE_FIELDS: list[str] = [
    "symbol",
    "name",
    "exchange",
    "currency",
    "price",
    "open",
    "high",
    "low",
    "volume",
    "change",
    "change_percent",
    "previous_close",
    "is_market_open",
    "average_volume",
    "fifty_two_week_low",
    "fifty_two_week_high",
    "day_range_pct",
    "fifty_two_week_pct",
    "gap_pct",
    "volume_ratio",
    "intraday_range_pct",
    "signal",
    "timestamp",
]


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------


def safe_float(raw: dict, key: str, fallback: float = 0.0) -> float:
    """Safely parse a float from a dict of strings."""
    try:
        return float(raw.get(key, fallback))
    except (ValueError, TypeError):
        return fallback


# ---------------------------------------------------------------------------
# Quote conversion helpers
# ---------------------------------------------------------------------------


def quote_to_dict(source: object, **extra: object) -> dict:
    """Convert any quote-like object to a plain dict.

    Works with SQLAlchemy models (attribute access) and protobuf messages
    (also attribute access).  Extra keyword arguments are merged into the
    result, which lets callers add fields like ``cached=True``.
    """
    result = {field: getattr(source, field, None) for field in QUOTE_FIELDS}
    result.update(extra)
    return result


def upsert_quote(db: Session, quote: object) -> None:
    """Insert or update a quote row, reading fields from *quote*.

    *quote* is typically a protobuf ``TransformResponse`` but can be any
    object whose attributes match :data:`QUOTE_FIELDS`.
    """
    from trading_lib.models import Quote

    existing = db.query(Quote).filter(Quote.symbol == quote.symbol).first()

    if existing:
        for field in QUOTE_FIELDS:
            if field == "symbol":
                continue
            setattr(existing, field, getattr(quote, field, None))
        existing.updated_at = datetime.now(timezone.utc)
    else:
        kwargs = {field: getattr(quote, field, None) for field in QUOTE_FIELDS}
        kwargs["source"] = "pipeline"
        db.add(Quote(**kwargs))

    db.commit()


# ---------------------------------------------------------------------------
# Market-hours helpers
# ---------------------------------------------------------------------------


def is_market_open() -> bool:
    """Return True if the US stock market is currently open (approximate).

    Uses a simple weekday + UTC hour/minute check.  Does not account for
    US holidays -- on those days a single unnecessary API call may occur.
    """
    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:  # Saturday / Sunday
        return False
    hour, minute = now.hour, now.minute
    if hour < MARKET_OPEN_HOUR or hour >= MARKET_CLOSE_HOUR:
        return False
    if hour == MARKET_OPEN_HOUR and minute < MARKET_OPEN_MINUTE:
        return False
    return True


def last_market_close() -> datetime:
    """Return the datetime of the most recent US market close.

    Logic:
    - Mon-Fri after 21:00 UTC  -> today 21:00
    - Mon-Fri before 21:00 UTC -> previous business day 21:00
    - Saturday                  -> Friday 21:00
    - Sunday                    -> Friday 21:00
    """
    now = datetime.now(timezone.utc)
    close_today = now.replace(hour=MARKET_CLOSE_HOUR, minute=0, second=0, microsecond=0)

    weekday = now.weekday()  # Mon=0 .. Sun=6

    if weekday == 5:  # Saturday -> Friday
        return close_today - timedelta(days=1)
    if weekday == 6:  # Sunday -> Friday
        return close_today - timedelta(days=2)
    # Weekday
    if now >= close_today:
        return close_today  # market already closed today
    # Before today's close -> previous business day
    if weekday == 0:  # Monday -> Friday
        return close_today - timedelta(days=3)
    return close_today - timedelta(days=1)


def is_quote_fresh(
    updated_at: datetime | None,
    staleness_seconds: int = 60,
) -> bool:
    """Decide whether a cached quote is still fresh enough to skip refetching.

    Market-aware staleness:
    - During market hours  : fresh if age < *staleness_seconds*.
    - Outside market hours : fresh if *updated_at* is AFTER the most recent
      market close (i.e. we already captured the closing price).
    - If *updated_at* is None: always stale (first-time fetch).
    """
    if updated_at is None:
        return False

    # Ensure timezone-aware comparison
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)

    if is_market_open():
        age = (datetime.now(timezone.utc) - updated_at).total_seconds()
        return age < staleness_seconds

    # Market is closed: fresh only if updated after the last close
    return updated_at > last_market_close()
