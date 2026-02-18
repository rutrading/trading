"""Create database tables for gRPC services."""

from trading_lib.db import Base, get_engine
from trading_lib.models import Quote  # noqa: F401

engine = get_engine()
Base.metadata.create_all(bind=engine)
print("Service tables created.")
