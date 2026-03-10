from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Date,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Symbol(Base):
    __tablename__ = "symbol"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)  # "AAPL", "BTC/USD"
    name: Mapped[str] = mapped_column(String)  # "Apple Inc."
    exchange: Mapped[str | None] = mapped_column(
        String, default=None
    )  # "NASDAQ", "NYSE"
    asset_class: Mapped[str] = mapped_column(String)  # "us_equity" | "crypto"
    tradable: Mapped[bool] = mapped_column(default=True)
    fractionable: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    quote: Mapped["Quote | None"] = relationship(back_populates="symbol", uselist=False)
    daily_bars: Mapped[list["DailyBar"]] = relationship(back_populates="symbol")
    orders: Mapped[list["Order"]] = relationship(back_populates="symbol")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="symbol")
    holdings: Mapped[list["Holding"]] = relationship(back_populates="symbol")
    watchlist_items: Mapped[list["WatchlistItem"]] = relationship(
        back_populates="symbol"
    )


class Quote(Base):
    __tablename__ = "quote"

    ticker: Mapped[str] = mapped_column(
        String, ForeignKey("symbol.ticker", ondelete="CASCADE"), primary_key=True
    )
    price: Mapped[float | None] = mapped_column(Float, default=None)
    bid_price: Mapped[float | None] = mapped_column(Float, default=None)
    bid_size: Mapped[float | None] = mapped_column(Float, default=None)
    ask_price: Mapped[float | None] = mapped_column(Float, default=None)
    ask_size: Mapped[float | None] = mapped_column(Float, default=None)
    open: Mapped[float | None] = mapped_column(Float, default=None)
    high: Mapped[float | None] = mapped_column(Float, default=None)
    low: Mapped[float | None] = mapped_column(Float, default=None)
    close: Mapped[float | None] = mapped_column(Float, default=None)
    volume: Mapped[float | None] = mapped_column(Float, default=None)
    trade_count: Mapped[int | None] = mapped_column(Integer, default=None)
    vwap: Mapped[float | None] = mapped_column(Float, default=None)
    previous_close: Mapped[float | None] = mapped_column(Float, default=None)
    change: Mapped[float | None] = mapped_column(Float, default=None)
    change_percent: Mapped[float | None] = mapped_column(Float, default=None)
    source: Mapped[str | None] = mapped_column(String, default=None)
    timestamp: Mapped[int | None] = mapped_column(Integer, default=None)
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    symbol: Mapped["Symbol"] = relationship(back_populates="quote")


class DailyBar(Base):
    __tablename__ = "daily_bar"
    __table_args__ = (UniqueConstraint("ticker", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(
        String, ForeignKey("symbol.ticker", ondelete="CASCADE"), index=True
    )
    date: Mapped[str] = mapped_column(Date)  # trading date
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)
    trade_count: Mapped[int | None] = mapped_column(Integer, default=None)
    vwap: Mapped[float | None] = mapped_column(Float, default=None)

    symbol: Mapped["Symbol"] = relationship(back_populates="daily_bars")


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
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"), index=True)
    asset_class: Mapped[str] = mapped_column(String)  # "us_equity" | "crypto"
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
    symbol: Mapped["Symbol"] = relationship(back_populates="orders")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="order")


class Transaction(Base):
    __tablename__ = "transaction"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("order.id", ondelete="CASCADE"))
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
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
    symbol: Mapped["Symbol"] = relationship(back_populates="transactions")


class Holding(Base):
    __tablename__ = "holding"
    __table_args__ = (UniqueConstraint("trading_account_id", "ticker"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    asset_class: Mapped[str] = mapped_column(String)  # "us_equity" | "crypto"
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
    symbol: Mapped["Symbol"] = relationship(back_populates="holdings")


class WatchlistItem(Base):
    __tablename__ = "watchlist_item"
    __table_args__ = (UniqueConstraint("user_id", "ticker"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    symbol: Mapped["Symbol"] = relationship(back_populates="watchlist_items")
