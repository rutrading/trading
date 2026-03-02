from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

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
    "example",
    "timestamp",
]

MARKET_OPEN_HOUR = 14
MARKET_OPEN_MINUTE = 30
MARKET_CLOSE_HOUR = 21


def safe_float(raw: dict, key: str, fallback: float = 0.0) -> float:
    try:
        return float(raw.get(key, fallback))
    except (ValueError, TypeError):
        return fallback


def quote_to_dict(source: object, **extra: object) -> dict:
    result = {field: getattr(source, field, None) for field in QUOTE_FIELDS}
    result.update(extra)
    return result


def upsert_quote(db: Session, quote: object) -> None:
    from app.models import Quote

    existing = db.query(Quote).filter(Quote.symbol == quote.symbol).first()
    if existing:
        for field in QUOTE_FIELDS:
            if field != "symbol":
                setattr(existing, field, getattr(quote, field, None))
        existing.updated_at = datetime.now(timezone.utc)
    else:
        kwargs = {field: getattr(quote, field, None) for field in QUOTE_FIELDS}
        kwargs["source"] = "pipeline"
        db.add(Quote(**kwargs))
    db.commit()


def is_market_open() -> bool:
    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:
        return False
    hour, minute = now.hour, now.minute
    if hour < MARKET_OPEN_HOUR or hour >= MARKET_CLOSE_HOUR:
        return False
    if hour == MARKET_OPEN_HOUR and minute < MARKET_OPEN_MINUTE:
        return False
    return True


def last_market_close() -> datetime:
    now = datetime.now(timezone.utc)
    close_today = now.replace(hour=MARKET_CLOSE_HOUR, minute=0, second=0, microsecond=0)
    weekday = now.weekday()
    if weekday == 5:
        return close_today - timedelta(days=1)
    if weekday == 6:
        return close_today - timedelta(days=2)
    if now >= close_today:
        return close_today
    if weekday == 0:
        return close_today - timedelta(days=3)
    return close_today - timedelta(days=1)


def is_quote_fresh(updated_at: datetime | None, staleness_seconds: int = 60) -> bool:
    if updated_at is None:
        return False
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    if is_market_open():
        age = (datetime.now(timezone.utc) - updated_at).total_seconds()
        return age < staleness_seconds
    return updated_at > last_market_close()
