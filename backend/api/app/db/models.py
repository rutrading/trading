from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Quote(Base):
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
    created_at: Mapped[datetime | None] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AccountMember(Base):
    __tablename__ = "account_member"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))


class TradingAccount(Base):
    __tablename__ = "trading_account"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # "investment" | "crypto"
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("100000"))
    is_joint: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    orders: Mapped[list["Order"]] = relationship(back_populates="trading_account")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="trading_account"
    )
    holdings: Mapped[list["Holding"]] = relationship(back_populates="trading_account")


class Order(Base):
    __tablename__ = "order"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String, index=True)
    asset_type: Mapped[str] = mapped_column(String)  # "stock" | "etf" | "crypto"
    side: Mapped[str] = mapped_column(String)  # "buy" | "sell"
    order_type: Mapped[str] = mapped_column(
        String
    )  # "market" | "limit" | "stop" | "stop_limit"
    time_in_force: Mapped[str] = mapped_column(String)  # "day" | "gtc"
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8))
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    stop_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    filled_quantity: Mapped[Decimal] = mapped_column(
        Numeric(16, 8), default=Decimal("0")
    )
    average_fill_price: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), default=None
    )
    status: Mapped[str] = mapped_column(String, index=True, default="pending")
    rejection_reason: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    trading_account: Mapped["TradingAccount"] = relationship(back_populates="orders")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="order")


class Transaction(Base):
    __tablename__ = "transaction"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("order.id", ondelete="CASCADE"))
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String)
    side: Mapped[str] = mapped_column(String)  # "buy" | "sell"
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8))
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    order: Mapped["Order"] = relationship(back_populates="transactions")
    trading_account: Mapped["TradingAccount"] = relationship(
        back_populates="transactions"
    )


class Holding(Base):
    __tablename__ = "holding"
    __table_args__ = (UniqueConstraint("trading_account_id", "symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String)
    asset_type: Mapped[str] = mapped_column(String)  # "stock" | "etf" | "crypto"
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8), default=Decimal("0"))
    average_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    trading_account: Mapped["TradingAccount"] = relationship(back_populates="holdings")


class WatchlistItem(Base):
    __tablename__ = "watchlist_item"
    __table_args__ = (UniqueConstraint("user_id", "symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    symbol: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
