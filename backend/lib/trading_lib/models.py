"""Shared SQLAlchemy models for all services.

Schema is managed by Drizzle (web/src/db/schema.ts).
This model is a read/write mapping only — do not use for migrations.
"""

from datetime import datetime, timezone

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from trading_lib.db import Base


class Quote(Base):
    """Cached stock quote, written by the persistence service."""

    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String, index=True)
    price: Mapped[float]
    open: Mapped[float | None] = mapped_column(default=None)
    high: Mapped[float | None] = mapped_column(default=None)
    low: Mapped[float | None] = mapped_column(default=None)
    volume: Mapped[float | None] = mapped_column(default=None)
    change: Mapped[float | None] = mapped_column(default=None)
    change_percent: Mapped[float | None] = mapped_column(default=None)
    source: Mapped[str | None] = mapped_column(default=None)
    timestamp: Mapped[int | None] = mapped_column(default=None)
    name: Mapped[str | None] = mapped_column(default=None)
    exchange: Mapped[str | None] = mapped_column(default=None)
    currency: Mapped[str | None] = mapped_column(default=None)
    previous_close: Mapped[float | None] = mapped_column(default=None)
    is_market_open: Mapped[bool | None] = mapped_column(default=None)
    average_volume: Mapped[float | None] = mapped_column(default=None)
    fifty_two_week_low: Mapped[float | None] = mapped_column(default=None)
    fifty_two_week_high: Mapped[float | None] = mapped_column(default=None)
    day_range_pct: Mapped[float | None] = mapped_column(default=None)
    fifty_two_week_pct: Mapped[float | None] = mapped_column(default=None)
    gap_pct: Mapped[float | None] = mapped_column(default=None)
    volume_ratio: Mapped[float | None] = mapped_column(default=None)
    intraday_range_pct: Mapped[float | None] = mapped_column(default=None)
    signal: Mapped[str | None] = mapped_column(default=None)
    example: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime | None] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
