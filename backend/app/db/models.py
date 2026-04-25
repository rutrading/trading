"""SQLAlchemy models mirroring the Drizzle schema (web/src/db/schema.ts).

Drizzle is the source of truth. These models must match exactly.
Postgres enums are created by drizzle-kit push; SQLAlchemy references them
by name so it reads/writes the correct enum values.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

# Postgres enum types created by Drizzle.
# create_type=False tells SQLAlchemy not to try to CREATE the enum itself;
# drizzle-kit push already handles that.
account_type_enum = Enum(
    "investment",
    "crypto",
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
strategy_type_enum = Enum(
    "ema_crossover",
    name="strategy_type",
    create_type=False,
)
strategy_status_enum = Enum(
    "active",
    "paused",
    "disabled",
    name="strategy_status",
    create_type=False,
)
strategy_signal_enum = Enum(
    "buy",
    "sell",
    "hold",
    name="strategy_signal",
    create_type=False,
)
strategy_action_enum = Enum(
    "place_buy",
    "place_sell",
    "none",
    name="strategy_action",
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
    strategies: Mapped[list["Strategy"]] = relationship(back_populates="symbol")
    strategy_runs: Mapped[list["StrategyRun"]] = relationship(back_populates="symbol")
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
    logo_url: Mapped[str | None] = mapped_column(String, default=None)

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
    reserved_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("0")
    )
    is_joint: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    orders: Mapped[list["Order"]] = relationship(back_populates="trading_account")
    strategies: Mapped[list["Strategy"]] = relationship(
        back_populates="trading_account"
    )
    strategy_runs: Mapped[list["StrategyRun"]] = relationship(
        back_populates="trading_account"
    )
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
    reserved_per_share: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 10), nullable=True, default=None
    )
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


class Strategy(Base):
    __tablename__ = "strategy"
    __table_args__ = (
        Index("strategy_trading_account_id_idx", "trading_account_id"),
        Index("strategy_ticker_idx", "ticker"),
        Index("strategy_status_idx", "status"),
        UniqueConstraint(
            "trading_account_id",
            "strategy_type",
            "ticker",
            name="strategy_account_type_ticker_idx",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String)
    strategy_type: Mapped[str] = mapped_column(
        strategy_type_enum, default="ema_crossover"
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    symbols_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    timeframe: Mapped[str] = mapped_column(String, default="1Day")
    capital_allocation: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), default=Decimal("10000")
    )
    params_json: Mapped[dict] = mapped_column(JSON)
    risk_json: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(strategy_status_enum, default="active")
    last_run_at: Mapped[datetime | None] = mapped_column(default=None)
    last_signal_at: Mapped[datetime | None] = mapped_column(default=None)
    last_error: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    trading_account: Mapped["TradingAccount"] = relationship(
        back_populates="strategies"
    )
    symbol: Mapped["Symbol"] = relationship(back_populates="strategies")
    runs: Mapped[list["StrategyRun"]] = relationship(back_populates="strategy")


class StrategyRun(Base):
    __tablename__ = "strategy_run"
    __table_args__ = (
        Index("strategy_run_strategy_id_idx", "strategy_id"),
        Index("strategy_run_trading_account_id_idx", "trading_account_id"),
        Index("strategy_run_run_at_idx", "run_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    strategy_id: Mapped[int] = mapped_column(
        ForeignKey("strategy.id", ondelete="CASCADE")
    )
    trading_account_id: Mapped[int] = mapped_column(
        ForeignKey("trading_account.id", ondelete="CASCADE")
    )
    ticker: Mapped[str] = mapped_column(String, ForeignKey("symbol.ticker"))
    run_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    signal: Mapped[str] = mapped_column(strategy_signal_enum, default="hold")
    action: Mapped[str] = mapped_column(strategy_action_enum, default="none")
    reason: Mapped[str] = mapped_column(String)
    inputs_json: Mapped[dict] = mapped_column(JSON)
    order_id: Mapped[int | None] = mapped_column(
        ForeignKey("order.id", ondelete="SET NULL"),
        default=None,
    )
    error: Mapped[str | None] = mapped_column(String, default=None)

    strategy: Mapped["Strategy"] = relationship(back_populates="runs")
    trading_account: Mapped["TradingAccount"] = relationship(
        back_populates="strategy_runs"
    )
    symbol: Mapped["Symbol"] = relationship(back_populates="strategy_runs")
    order: Mapped["Order | None"] = relationship()


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
    reserved_quantity: Mapped[Decimal] = mapped_column(
        Numeric(16, 8), default=Decimal("0")
    )
    average_cost: Mapped[Decimal] = mapped_column(
        Numeric(20, 10), default=Decimal("0")
    )
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
