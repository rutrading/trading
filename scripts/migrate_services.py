"""Create database tables for gRPC services."""

from sqlalchemy import inspect, text

from trading_lib.db import Base, get_engine
from trading_lib.models import Quote  # noqa: F401

engine = get_engine()

# Create tables that don't exist yet
Base.metadata.create_all(bind=engine)

# Add missing columns to existing tables (create_all won't do this)
inspector = inspect(engine)
if "quotes" in inspector.get_table_names():
    existing = {col["name"] for col in inspector.get_columns("quotes")}
    model_columns = {col.name: col for col in Quote.__table__.columns}
    new_cols = set(model_columns) - existing

    if new_cols:
        with engine.begin() as conn:
            for name in new_cols:
                col = model_columns[name]
                col_type = col.type.compile(engine.dialect)
                conn.execute(text(f"ALTER TABLE quotes ADD COLUMN {name} {col_type}"))
                print(f"  Added column: quotes.{name} ({col_type})")

print("Service tables up to date.")
