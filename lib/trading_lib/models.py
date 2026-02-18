"""Shared SQLAlchemy models for all services."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from trading_lib.db import Base


class Quote(Base):
    """Cached stock quote, written by the filter service."""

    __tablename__ = "quotes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String, nullable=False, index=True)
    price = Column(Float, nullable=False)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    volume = Column(Float)
    change = Column(Float)
    change_percent = Column(Float)
    source = Column(String)
    timestamp = Column(Integer)
    name = Column(String)
    exchange = Column(String)
    currency = Column(String)
    previous_close = Column(Float)
    is_market_open = Column(Boolean)
    average_volume = Column(Float)
    fifty_two_week_low = Column(Float)
    fifty_two_week_high = Column(Float)
    day_range_pct = Column(Float)
    fifty_two_week_pct = Column(Float)
    gap_pct = Column(Float)
    volume_ratio = Column(Float)
    intraday_range_pct = Column(Float)
    signal = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
