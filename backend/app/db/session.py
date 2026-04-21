from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_config


class Base(DeclarativeBase):
    pass


_engine = None
_session_local = None


def get_engine():
    global _engine
    if _engine is None:
        config = get_config()
        _engine = create_engine(config.database_url)
    return _engine


def get_session_factory():
    global _session_local
    if _session_local is None:
        _session_local = sessionmaker(bind=get_engine())
    return _session_local


def get_db() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    except Exception:
        # Explicit rollback on uncaught exceptions so a partial
        # transaction never lingers on the connection. SQLAlchemy
        # auto-rolls back on close, but being explicit here survives
        # library behavior changes and reads better in tracebacks.
        session.rollback()
        raise
    finally:
        session.close()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
