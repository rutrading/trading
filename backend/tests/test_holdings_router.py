"""Router-level tests for /api/holdings Kalshi-account behavior.

Cross-tenant access for the brokerage path is covered alongside the orders
router in test_orders_router.py; this file owns the kalshi-account empty-
result behavior so the brokerage IDOR coverage stays where its sibling cases
already live.
"""

import os

os.environ["SKIP_AUTH"] = "false"

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_holding,
    seed_symbol,
    seed_user,
)

client = TestClient(app)


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


def test_holdings_returns_empty_for_kalshi_account(session_factory):
    # Seed a holding row that would otherwise come back if the type guard
    # wasn't filtering — proving the empty response is the guard's doing.
    with session_factory() as db:
        seed_user(db, "user-a")
        seed_symbol(db, "AAPL")
        account = seed_account(
            db, "user-a", name="Kalshi", balance="0", type_="kalshi",
        )
        seed_holding(db, account.id, "AAPL", quantity="5")
        account_id = account.id

    with db_override(session_factory), auth_as("user-a"):
        response = client.get(
            "/api/holdings", params={"trading_account_id": account_id}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["holdings"] == []
    assert body["trading_account_id"] == account_id
    assert Decimal(body["cash_balance"]) == Decimal("0")
