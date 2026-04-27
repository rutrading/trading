"""SQLAlchemy models mirroring the Drizzle schema (web/src/db/schema.ts).

Drizzle is the source of truth. These models must match exactly.
Postgres enums are created by drizzle-kit push; SQLAlchemy references them
by name so it reads/writes the correct enum values.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Postgres enum types created by Drizzle.
# create_type=False tells SQLAlchemy not to try to CREATE the enum itself;
# drizzle-kit push already handles that.
account_type_enum = Enum(
    "investment",
    "crypto",
    "kalshi",
    name="account_type",
    create_type=False,
)
asset_class_enum = Enum(
    "us_equity",
    "crypto",
    name="asset_class",
    create_type=False,
)
order_side_enum = Enum(
    "buy",
    "sell",
    name="order_side",
    create_type=False,
)
order_type_enum = Enum(
    "market",
    "limit",
    "stop",
    "stop_limit",
    name="order_type",
    create_type=False,
)
time_in_force_enum = Enum(
    "day",
    "gtc",
    "opg",
    "cls",
    name="time_in_force",
    create_type=False,
)
order_status_enum = Enum(
    "pending",
    "open",
    "partially_filled",
    "filled",
    "cancelled",
    "rejected",
    name="order_status",
    create_type=False,
)
transaction_kind_enum = Enum(
    "trade",
    "deposit",
    "withdrawal",
    name="transaction_kind",
    create_type=False,
)
experience_level_enum = Enum(
    "beginner",
    "intermediate",
    "advanced",
    "expert",
    name="experience_level",
    create_type=False,
)

# Kalshi uses one-L "canceled" — distinct from order_status_enum's two-L
# "cancelled". Both must round-trip from the respective external APIs.
kalshi_order_side_enum = Enum(
    "yes",
    "no",
    name="kalshi_order_side",
    create_type=False,
)
kalshi_order_action_enum = Enum(
    "buy",
    "sell",
    name="kalshi_order_action",
    create_type=False,
)
kalshi_order_status_enum = Enum(
    "pending",
    "resting",
    "executed",
    "canceled",
    "rejected",
    name="kalshi_order_status",
    create_type=False,
)
kalshi_order_type_enum = Enum(
    "limit",
    "market",
    name="kalshi_order_type",
    create_type=False,
)
kalshi_account_status_enum = Enum(
    "local_only",
    "active",
    "failed",
    name="kalshi_account_status",
    create_type=False,
)
kalshi_signal_decision_enum = Enum(
    "emitted",
    "skipped",
    "dry_run",
    "blocked",
    name="kalshi_signal_decision",
    create_type=False,
)


class User(Base):
    """Minimal reflection of the Better-Auth user table.

    The actual table is managed by Drizzle; this model only exists so
    SQLAlchemy can resolve foreign keys that reference user.id.
    """

    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String)


class Symbol(Base):
    __tablename__ = "symbol"

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    exchange: Mapped[str | None] = mapped_column(String, default=None)
    asset_class: Mapped[str] = mapped_column(asset_class_enum)
    tradable: Mapped[bool] = mapped_column(Boolean, default=True)
    fractionable: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    quote: Mapped["Quote | None"] = relationship(back_populates="symbol", uselist=False)
    company: Mapped["Company | None"] = relationship(
        back_populates="symbol", uselist=False
    )
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
    # NB: price columns here are Postgres double precision (Float). Callers
    # converting to Decimal for trade math should do `Decimal(str(value))` —
    # the float→Decimal conversion is lossy in the last few binary digits.
    # The truncation is acceptable for a paper-trading sim because the value
    # is only used to compute fill prices, which are themselves persisted at
    # numeric(20,10) precision in transaction.price.
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


class Company(Base):
    __tablename__ = "company"

    ticker: Mapped[str] = mapped_column(
        String, ForeignKey("symbol.ticker", ondelete="CASCADE"), primary_key=True
    )
    description: Mapped[str | None] = mapped_column(String, default=None)
    sector: Mapped[str | None] = mapped_column(String, default=None)
    industry: Mapped[str | None] = mapped_column(String, default=None)

    symbol: Mapped["Symbol"] = relationship(back_populates="company")


class DailyBar(Base):
    __tablename__ = "daily_bar"
    __table_args__ = (
        UniqueConstraint("ticker", "date", name="daily_bar_ticker_date_idx"),
        Index("daily_bar_ticker_idx", "ticker"),
        Index("daily_bar_date_idx", "date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(
        String, ForeignKey("symbol.ticker", ondelete="CASCADE")
    )
    date: Mapped[str] = mapped_column(Date)
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
    __table_args__ = (
        Index("account_member_accountId_idx", "account_id"),
        Index("account_member_userId_idx", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))


class TradingAccount(Base):
    __tablename__ = "trading_account"
    __table_args__ = (Index("trading_account_type_idx", "type"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(account_type_enum)
    experience_level: Mapped[str] = mapped_column(
        experience_level_enum, default="beginner"
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("100000"))
    reserved_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    is_joint: Mapped[bool] = mapped_column(Boolean, default=False)
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
    __table_args__ = (
        Index("order_trading_account_id_idx", "trading_account_id"),
        Index("order_ticker_idx", "ticker"),
        Index("order_status_idx", "status"),
        Index("order_created_at_idx", "created_at"),
        # Composite indexes mirroring web/src/db/schema.ts so the planner
        # can serve the dominant `WHERE trading_account_id = $1 [AND
        # status = $2] ORDER BY created_at DESC LIMIT N` queries via an
        # in-order index walk instead of a per-account sort.
        Index(
            "order_account_created_idx",
            "trading_account_id",
            text("created_at DESC"),
        ),
        Index(
            "order_account_status_created_idx",
            "trading_account_id",
            "status",
            text("created_at DESC"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    asset_class: Mapped[str] = mapped_column(asset_class_enum)
    side: Mapped[str] = mapped_column(order_side_enum)
    order_type: Mapped[str] = mapped_column(order_type_enum)
    time_in_force: Mapped[str] = mapped_column(time_in_force_enum)
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8))
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 10), default=None)
    stop_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 10), default=None)
    filled_quantity: Mapped[Decimal] = mapped_column(
        Numeric(16, 8), default=Decimal("0")
    )
    average_fill_price: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 10), default=None
    )
    # Snapshot of the live market price at placement time for market orders
    # (null for limit/stop/stop_limit — their intent lives in limit_price/stop_price).
    reference_price: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 10), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(order_status_enum, default="pending")
    rejection_reason: Mapped[str | None] = mapped_column(String, default=None)
    reserved_per_share: Mapped[Decimal | None] = mapped_column(Numeric(20, 10), nullable=True, default=None)
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
    __table_args__ = (
        Index("transaction_trading_account_id_idx", "trading_account_id"),
        Index("transaction_order_id_idx", "order_id"),
        Index("transaction_ticker_idx", "ticker"),
        Index("transaction_created_at_idx", "created_at"),
        # Composite index mirroring web/src/db/schema.ts so the planner
        # can serve `WHERE trading_account_id = $1 ORDER BY created_at
        # DESC LIMIT N` via an in-order index walk.
        Index(
            "transaction_account_created_idx",
            "trading_account_id",
            text("created_at DESC"),
        ),
        # Trade-kind transactions must retain the columns that became
        # nullable when deposit/withdrawal kinds were added. Mirrors the
        # CHECK constraint added in 0008_transaction_trade_columns_check.sql.
        CheckConstraint(
            "kind <> 'trade' OR (order_id IS NOT NULL AND ticker IS NOT NULL "
            "AND side IS NOT NULL AND quantity IS NOT NULL AND price IS NOT NULL)",
            name="transaction_trade_columns_required_check",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(transaction_kind_enum, default="trade")
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("order.id", ondelete="CASCADE"), nullable=True
    )
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str | None] = mapped_column(
        String, ForeignKey("symbol.ticker"), nullable=True
    )
    side: Mapped[str | None] = mapped_column(order_side_enum, nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(16, 8), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 10), nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    order: Mapped["Order | None"] = relationship(back_populates="transactions")
    trading_account: Mapped["TradingAccount"] = relationship(
        back_populates="transactions"
    )
    symbol: Mapped["Symbol | None"] = relationship(back_populates="transactions")


class Holding(Base):
    __tablename__ = "holding"
    __table_args__ = (
        UniqueConstraint(
            "trading_account_id", "ticker", name="holding_account_ticker_idx"
        ),
        Index("holding_trading_account_id_idx", "trading_account_id"),
        Index("holding_ticker_idx", "ticker"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    asset_class: Mapped[str] = mapped_column(asset_class_enum)
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8), default=Decimal("0"))
    reserved_quantity: Mapped[Decimal] = mapped_column(Numeric(16, 8), default=Decimal("0"))
    average_cost: Mapped[Decimal] = mapped_column(Numeric(20, 10), default=Decimal("0"))
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
    __table_args__ = (
        UniqueConstraint("user_id", "ticker", name="watchlist_item_user_ticker_idx"),
        Index("watchlist_item_user_id_idx", "user_id"),
        Index("watchlist_item_ticker_idx", "ticker"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    symbol: Mapped["Symbol"] = relationship(back_populates="watchlist_items")


# JSONB columns must use with_variant(JSON(), "sqlite") so the SQLite test
# engine in integration_helpers.make_test_engine can run create_all without
# choking on the Postgres-only JSONB type.
_JsonbCol = JSONB().with_variant(JSON(), "sqlite")


class KalshiAccount(Base):
    __tablename__ = "kalshi_account"
    __table_args__ = (
        # subaccount_number must be unique when not null, but multiple rows may
        # be local_only (null) at the same time — partial unique index in
        # Drizzle, mirrored here so future ALTER passes don't drift.
        Index(
            "kalshi_account_subaccount_number_idx",
            "subaccount_number",
            unique=True,
            postgresql_where=text("subaccount_number IS NOT NULL"),
            sqlite_where=text("subaccount_number IS NOT NULL"),
        ),
        CheckConstraint(
            "subaccount_number IS NULL "
            "OR (subaccount_number BETWEEN 1 AND 32)",
            name="kalshi_account_subaccount_number_range_check",
        ),
    )

    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    subaccount_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        kalshi_account_status_enum, default="local_only"
    )
    provisioning_error: Mapped[str | None] = mapped_column(String, nullable=True)
    last_balance_dollars: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class KalshiMarket(Base):
    __tablename__ = "kalshi_market"
    __table_args__ = (
        Index("kalshi_market_series_ticker_idx", "series_ticker"),
        Index("kalshi_market_close_time_idx", "close_time"),
        Index("kalshi_market_status_idx", "status"),
    )

    ticker: Mapped[str] = mapped_column(String, primary_key=True)
    event_ticker: Mapped[str | None] = mapped_column(String, nullable=True)
    series_ticker: Mapped[str] = mapped_column(String)
    market_type: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    yes_sub_title: Mapped[str | None] = mapped_column(String, nullable=True)
    no_sub_title: Mapped[str | None] = mapped_column(String, nullable=True)
    strike_type: Mapped[str | None] = mapped_column(String, nullable=True)
    floor_strike: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 6), nullable=True
    )
    cap_strike: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    open_time: Mapped[datetime | None] = mapped_column(nullable=True)
    close_time: Mapped[datetime | None] = mapped_column(nullable=True)
    latest_expiration_time: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    price_level_structure: Mapped[str | None] = mapped_column(String, nullable=True)
    price_ranges: Mapped[dict | None] = mapped_column(_JsonbCol, nullable=True)
    fractional_trading_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class KalshiSignal(Base):
    __tablename__ = "kalshi_signal"
    __table_args__ = (
        Index(
            "kalshi_signal_account_created_idx",
            "trading_account_id",
            text("created_at DESC"),
        ),
        Index("kalshi_signal_decision_idx", "decision"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    market_ticker: Mapped[str | None] = mapped_column(
        String, ForeignKey("kalshi_market.ticker"), nullable=True
    )
    strategy: Mapped[str] = mapped_column(String)
    side: Mapped[str | None] = mapped_column(kalshi_order_side_enum, nullable=True)
    action: Mapped[str | None] = mapped_column(
        kalshi_order_action_enum, nullable=True
    )
    count_fp: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    limit_price_dollars: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    decision: Mapped[str] = mapped_column(kalshi_signal_decision_enum)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    snapshot: Mapped[dict | None] = mapped_column(_JsonbCol, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )


class KalshiOrder(Base):
    __tablename__ = "kalshi_order"
    __table_args__ = (
        Index(
            "kalshi_order_account_created_idx",
            "trading_account_id",
            text("created_at DESC"),
        ),
        Index(
            "kalshi_order_account_status_idx",
            "trading_account_id",
            "status",
        ),
        Index("kalshi_order_market_ticker_idx", "market_ticker"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    subaccount_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kalshi_order_id: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True
    )
    client_order_id: Mapped[str] = mapped_column(String, unique=True)
    market_ticker: Mapped[str] = mapped_column(
        String, ForeignKey("kalshi_market.ticker")
    )
    side: Mapped[str] = mapped_column(kalshi_order_side_enum)
    action: Mapped[str] = mapped_column(kalshi_order_action_enum)
    order_type: Mapped[str] = mapped_column(kalshi_order_type_enum)
    time_in_force: Mapped[str] = mapped_column(String, default="immediate_or_cancel")
    count_fp: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    limit_price_dollars: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    status: Mapped[str] = mapped_column(kalshi_order_status_enum)
    strategy: Mapped[str] = mapped_column(String)
    signal_id: Mapped[int | None] = mapped_column(
        ForeignKey("kalshi_signal.id"), nullable=True
    )
    fill_count_fp: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), default=Decimal("0")
    )
    remaining_count_fp: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_response: Mapped[dict | None] = mapped_column(_JsonbCol, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class KalshiPosition(Base):
    __tablename__ = "kalshi_position"
    __table_args__ = (
        UniqueConstraint(
            "trading_account_id",
            "market_ticker",
            name="kalshi_position_account_market_idx",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    subaccount_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    market_ticker: Mapped[str] = mapped_column(
        String, ForeignKey("kalshi_market.ticker")
    )
    position_fp: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), default=Decimal("0")
    )
    total_traded_dollars: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    market_exposure_dollars: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    realized_pnl_dollars: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    fees_paid_dollars: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    raw_response: Mapped[dict | None] = mapped_column(_JsonbCol, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class KalshiFill(Base):
    __tablename__ = "kalshi_fill"
    __table_args__ = (
        Index("kalshi_fill_trading_account_id_idx", "trading_account_id"),
        Index("kalshi_fill_market_ticker_idx", "market_ticker"),
        Index("kalshi_fill_kalshi_order_id_idx", "kalshi_order_id"),
        Index("kalshi_fill_executed_at_idx", "executed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    subaccount_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kalshi_fill_id: Mapped[str] = mapped_column(String, unique=True)
    kalshi_trade_id: Mapped[str | None] = mapped_column(String, nullable=True)
    kalshi_order_id: Mapped[str | None] = mapped_column(String, nullable=True)
    local_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("kalshi_order.id"), nullable=True
    )
    market_ticker: Mapped[str] = mapped_column(
        String, ForeignKey("kalshi_market.ticker")
    )
    side: Mapped[str] = mapped_column(kalshi_order_side_enum)
    action: Mapped[str] = mapped_column(kalshi_order_action_enum)
    count_fp: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    yes_price_dollars: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    no_price_dollars: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    fee_dollars: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    is_taker: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    executed_at: Mapped[datetime] = mapped_column()
    raw_response: Mapped[dict | None] = mapped_column(_JsonbCol, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )


class KalshiBotState(Base):
    __tablename__ = "kalshi_bot_state"

    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE"), primary_key=True
    )
    active_strategy: Mapped[str] = mapped_column(String, default="threshold_drift")
    automation_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    max_orders_per_cycle: Mapped[int] = mapped_column(Integer, default=1)
    max_open_contracts: Mapped[int] = mapped_column(Integer, default=5)
    last_cycle_at: Mapped[datetime | None] = mapped_column(nullable=True)
    last_error: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class News_Article(Base):
    __tablename__ = "news_article"

    article_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(nullable=False)
    url: Mapped[str] = mapped_column(nullable=False)
    summary: Mapped[str] = mapped_column(default=None)
    thumbnail: Mapped[str | None] = mapped_column(default=None)
    date_published: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        Index("article_articletId_idx", "article_id"),
    )

class News_Source(Base):
    __tablename__ = "news_source"

    news_source_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_name: Mapped[str] = mapped_column(nullable=False, unique=True)

    __table_args__ = (
        Index("news_source_news_sourcetId_idx", "news_source_id"),
    )

class News_Article_Source_Bridge(Base):
    __tablename__ = "news_article_source_bridge"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    article_id: Mapped[int] = mapped_column(Integer, ForeignKey("news_article.article_id"))
    news_source_id: Mapped[int] = mapped_column(Integer, ForeignKey("news_source.news_source_id"))
    
    __table_args__ = (
        Index("article_source_bridge_articleId_idx", "article_id"),
        Index("news_source_bridge_news_sourcetId_idx", "news_source_id")
    )

class Author(Base):
    __tablename__ = "author"

    author_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    article_id: Mapped[int] = mapped_column(Integer, ForeignKey("news_article.article_id"))
    author_name: Mapped[str] = mapped_column(nullable=False)

    __table_args__ = (
        Index("author_articleId_idx", "article_id"),
    )

class News_Article_Ticker_Bridge(Base):
    __tablename__ = "news_article_ticker_bridge"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    article_id: Mapped[int] = mapped_column(Integer, ForeignKey("news_article.article_id"))
    ticker_id: Mapped[int] = mapped_column(Integer, ForeignKey("article_stock_ticker.ticker_id"))

    __table_args__ = (
        Index("article_ticker_bridge_articletId_idx", "article_id"),
        Index("stock_ticker_tickerId_idx", "ticker_id")
    )

class Article_Stock_Ticker(Base):
    __tablename__ = "article_stock_ticker"

    ticker_id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))

    __table_args__ = (
        Index("stock_tickerId_idx", "ticker_id"),
        Index("article_stock_ticker_ticker_idx", "ticker")
    )

class ArticleSummaryView(Base):
    __tablename__ = "article_summary_view"
    
    article_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(nullable=False)
    url: Mapped[str] = mapped_column(nullable=False)
    summary: Mapped[str] = mapped_column(nullable=False)
    thumbnail: Mapped[str | None] = mapped_column(nullable=True)
    date_published: Mapped[datetime] = mapped_column( default=lambda: datetime.now(timezone.utc) )
    source_name: Mapped[str] = mapped_column(nullable=False)
    # Subquery Columns
    authors: Mapped[str | None] = mapped_column(nullable=True)
    tickers: Mapped[str | None] = mapped_column(nullable=True)

    __table_args__ = {"info": {"is_view": True}}
