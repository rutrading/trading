"""Router-level tests for /api/transactions Kalshi-account behavior.

Cross-tenant access for the brokerage path is covered alongside the orders
router in test_orders_router.py; this file owns the kalshi-account empty-
result behavior so the brokerage IDOR coverage stays where its sibling cases
already live.
"""

import os

os.environ["SKIP_AUTH"] = "false"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_transaction,
    seed_user,
)

client = TestClient(app)


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


def test_transactions_returns_empty_for_kalshi_account(session_factory):
    # Seed a deposit so the bare query path would otherwise return a row —
    # the empty response below is the type guard's doing, not "no data".
    with session_factory() as db:
        seed_user(db, "user-a")
        account = seed_account(
            db, "user-a", name="Kalshi", balance="0", type_="kalshi",
        )
        seed_transaction(db, account.id, kind="deposit", total="100")
        account_id = account.id

    with db_override(session_factory), auth_as("user-a"):
        response = client.get(
            "/api/transactions", params={"trading_account_id": account_id}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["transactions"] == []
    assert body["total"] == 0
    # Page/per_page echo the request's defaults (page=1, per_page=20).
    assert body["page"] == 1
    assert body["per_page"] == 20
