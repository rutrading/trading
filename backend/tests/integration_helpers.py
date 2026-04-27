"""Shared helpers for router integration tests.

Builds a SQLite in-memory DB with the full schema, returns a session factory,
and exposes an `auth_override` context manager that swaps in a fake user for
the duration of a single request.

Why SQLite, not the real Postgres test DB?
- Postgres enums (account_type, order_status, ...) are created by drizzle-kit
  push outside of pytest. Spinning a fresh test DB per run would either need
  to invoke drizzle from Python or create the enums manually, both of which
  add fragile coupling. SQLite ignores the enum constraint at the storage
  level (it stores the string), which is fine for asserting business logic
  in the routers — the enum check is enforced at the Pydantic boundary on
  the way in.
- with_for_update is a no-op on SQLite; tests in this file do not assert
  on lock contention. For genuine concurrency tests see test_orders_router_loop.
"""

import time
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.db import get_db
from app.db.models import (
    AccountMember,
    DailyBar,
    Holding,
    Order,
    Quote,
    Symbol,
    TradingAccount,
    Transaction,
    User,
)
from app.db.session import Base
from app.main import app


def make_test_engine():
    """Return a fresh SQLite engine with all tables created.

    StaticPool keeps a single connection alive for the engine, so every
    session sees the same in-memory database (default :memory: behavior is
    one DB per connection, which silently breaks multi-session tests).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def db_override(session_factory):
    """Override the FastAPI get_db dependency to use the given session factory.

    Each request gets its own session (matches production behavior of
    get_db). Yields nothing — caller seeds the DB via session_factory()
    directly before issuing requests.
    """

    def _get_db_override():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_db_override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db, None)


@contextmanager
def auth_as(user_id: str):
    """Override get_current_user to return a payload with the given sub."""
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": user_id,
        "name": user_id,
        "email": f"{user_id}@example.com",
    }
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def seed_user(db: Session, user_id: str) -> User:
    user = User(id=user_id, name=user_id, email=f"{user_id}@example.com")
    db.add(user)
    db.commit()
    return user


def seed_symbol(db: Session, ticker: str, asset_class: str = "us_equity") -> Symbol:
    symbol = Symbol(
        ticker=ticker,
        name=ticker,
        asset_class=asset_class,
        tradable=True,
        fractionable=True,
    )
    db.add(symbol)
    db.commit()
    return symbol


def seed_quote(
    db: Session,
    ticker: str,
    price: float | None,
    timestamp: int | None = None,
) -> Quote:
    # Default to a fresh data-event timestamp so resolve_quote's staleness
    # gate treats this as live. Tests that need a stale-quote scenario
    # pass `timestamp` explicitly.
    if timestamp is None:
        timestamp = int(time.time())
    quote = Quote(ticker=ticker, price=price, timestamp=timestamp)
    db.add(quote)
    db.commit()
    return quote


def seed_account(
    db: Session,
    owner_user_id: str,
    name: str = "Brokerage",
    balance: str = "10000",
    reserved_balance: str = "0",
    type_: str = "investment",
) -> TradingAccount:
    account = TradingAccount(
        name=name,
        type=type_,
        balance=Decimal(balance),
        reserved_balance=Decimal(reserved_balance),
    )
    db.add(account)
    db.commit()
    member = AccountMember(account_id=account.id, user_id=owner_user_id)
    db.add(member)
    db.commit()
    return account


def seed_order(
    db: Session,
    account_id: int,
    ticker: str,
    *,
    side: str = "buy",
    order_type: str = "limit",
    asset_class: str = "us_equity",
    quantity: str = "10",
    filled_quantity: str = "0",
    limit_price: str | None = "100",
    stop_price: str | None = None,
    time_in_force: str = "gtc",
    reserved_per_share: str | None = None,
    status: str = "open",
) -> Order:
    order = Order(
        trading_account_id=account_id,
        ticker=ticker,
        asset_class=asset_class,
        side=side,
        order_type=order_type,
        time_in_force=time_in_force,
        quantity=Decimal(quantity),
        filled_quantity=Decimal(filled_quantity),
        limit_price=Decimal(limit_price) if limit_price else None,
        stop_price=Decimal(stop_price) if stop_price else None,
        reserved_per_share=Decimal(reserved_per_share) if reserved_per_share else None,
        status=status,
    )
    db.add(order)
    db.commit()
    return order


def seed_holding(
    db: Session,
    account_id: int,
    ticker: str,
    *,
    quantity: str = "10",
    reserved_quantity: str = "0",
    average_cost: str = "100",
    asset_class: str = "us_equity",
) -> Holding:
    holding = Holding(
        trading_account_id=account_id,
        ticker=ticker,
        asset_class=asset_class,
        quantity=Decimal(quantity),
        reserved_quantity=Decimal(reserved_quantity),
        average_cost=Decimal(average_cost),
    )
    db.add(holding)
    db.commit()
    return holding


def seed_daily_bar(
    db: Session,
    ticker: str,
    *,
    bar_date: date | str = date(2025, 1, 15),
    open_: float = 100.0,
    high: float = 101.0,
    low: float = 99.0,
    close: float = 100.5,
    volume: float = 5_000_000,
) -> DailyBar:
    if isinstance(bar_date, str):
        bar_date = date.fromisoformat(bar_date)
    bar = DailyBar(
        ticker=ticker,
        date=bar_date,
        open=open_,
        high=high,
        low=low,
        close=close,
        volume=volume,
    )
    db.add(bar)
    db.commit()
    return bar


def seed_transaction(
    db: Session,
    account_id: int,
    *,
    order_id: int | None = None,
    kind: str = "trade",
    ticker: str | None = None,
    side: str | None = None,
    quantity: str | None = None,
    price: str | None = None,
    total: str = "0",
    created_at: datetime | None = None,
) -> Transaction:
    txn = Transaction(
        order_id=order_id,
        trading_account_id=account_id,
        kind=kind,
        ticker=ticker,
        side=side,
        quantity=Decimal(quantity) if quantity else None,
        price=Decimal(price) if price else None,
        total=Decimal(total),
        created_at=created_at or datetime.now(timezone.utc),
    )
    db.add(txn)
    db.commit()
    return txn
