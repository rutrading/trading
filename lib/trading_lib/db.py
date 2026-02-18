"""Shared database setup using SQLAlchemy."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from trading_lib.config import get_config

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine():
    """Get or create the SQLAlchemy engine."""
    global _engine
    if _engine is None:
        config = get_config()
        _engine = create_engine(config.database_url)
    return _engine


def get_session_factory():
    """Get or create the session factory."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine())
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and close it when done."""
    session_factory = get_session_factory()
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
