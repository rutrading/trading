"""Router-level integration tests for /api/orders endpoints.

Covers IDOR (cross-tenant access), the place_order assembly (server-owned
quote snapshot, deferred-market reservation, no-quote rejection, decimal
validator), the last_fill_at N+1-avoidance helper, and cancel-order
reservation release for partially-filled orders.

These tests use a SQLite in-memory DB seeded directly via
integration_helpers; auth is overridden per-test via auth_as.
"""

import os

# SKIP_AUTH must be off so the router auth/membership branches actually run.
os.environ["SKIP_AUTH"] = "false"

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.db.models import Holding, Order, TradingAccount
from app.main import app
from app.schemas import OrderResponse
from app.rate_limit import per_user as per_user_rate_limit
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_daily_bar,
    seed_holding,
    seed_order,
    seed_quote,
    seed_symbol,
    seed_transaction,
    seed_user,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Per-user order-placement/cancel limiters are process-wide singletons.
    Reset before each test so one test's burst doesn't bleed into the next."""
    per_user_rate_limit._reset_for_tests()
    yield
    per_user_rate_limit._reset_for_tests()


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


# ---------------------------------------------------------------------------
# IDOR — cross-tenant access must be rejected (Blocker 3)
# ---------------------------------------------------------------------------


class TestOrdersIDOR:
    """User B must not be able to read or cancel User A's orders.

    Policy: GET /orders/{id} and POST /orders/{id}/cancel return 404 ("Order
    not found") for orders that exist but belong to another account. The
    "collapse 403 to 404" behavior prevents enumeration of valid order IDs
    across tenants by watching for the 403-vs-404 split.

    List endpoints still return 403 ("not a member") because the
    trading_account_id is the explicit query parameter — the user is
    asserting membership there rather than probing an opaque identifier.
    """

    def _setup_two_users_one_order(self, factory):
        with factory() as db:
            seed_user(db, "user-a")
            seed_user(db, "user-b")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="10000")
            order = seed_order(
                db,
                account.id,
                "AAPL",
                side="buy",
                order_type="limit",
                limit_price="100",
                reserved_per_share="100",
            )
            return account.id, order.id

    def test_get_order_hides_foreign_order_as_404(self, session_factory):
        account_id, order_id = self._setup_two_users_one_order(session_factory)
        with db_override(session_factory), auth_as("user-b"):
            response = client.get(f"/api/orders/{order_id}")
        # 404 — same shape the missing-row branch returns. Attacker cannot
        # distinguish "doesn't exist" from "belongs to someone else."
        assert response.status_code == 404
        assert response.json()["detail"].lower() == "order not found"

    def test_get_order_succeeds_for_member(self, session_factory):
        account_id, order_id = self._setup_two_users_one_order(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.get(f"/api/orders/{order_id}")
        assert response.status_code == 200
        assert response.json()["id"] == order_id

    def test_cancel_order_hides_foreign_order_as_404(self, session_factory):
        account_id, order_id = self._setup_two_users_one_order(session_factory)
        with db_override(session_factory), auth_as("user-b"):
            response = client.post(f"/api/orders/{order_id}/cancel")
        assert response.status_code == 404
        assert response.json()["detail"].lower() == "order not found"
        # State was not mutated — fetch directly to confirm
        with session_factory() as db:
            order = db.query(Order).filter(Order.id == order_id).first()
            assert order.status == "open"

    def test_list_orders_rejects_non_member(self, session_factory):
        account_id, _ = self._setup_two_users_one_order(session_factory)
        with db_override(session_factory), auth_as("user-b"):
            response = client.get(
                "/api/orders", params={"trading_account_id": account_id}
            )
        assert response.status_code == 403

    def test_list_orders_succeeds_for_member(self, session_factory):
        account_id, order_id = self._setup_two_users_one_order(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.get(
                "/api/orders", params={"trading_account_id": account_id}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["total"] == 1
        assert body["orders"][0]["id"] == order_id


class TestHoldingsIDOR:
    def test_list_holdings_rejects_non_member(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_user(db, "user-b")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            seed_holding(db, account.id, "AAPL", quantity="5")
            account_id = account.id

        with db_override(session_factory), auth_as("user-b"):
            response = client.get(
                "/api/holdings", params={"trading_account_id": account_id}
            )
        assert response.status_code == 403


class TestTransactionsIDOR:
    def test_list_transactions_rejects_non_member(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_user(db, "user-b")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            # The CHECK constraint on transaction requires trade rows to
            # carry a non-null order_id; seed an order before the txn.
            order = seed_order(
                db,
                account.id,
                "AAPL",
                quantity="1",
                filled_quantity="1",
                status="filled",
            )
            seed_transaction(
                db,
                account.id,
                order_id=order.id,
                kind="trade",
                ticker="AAPL",
                side="buy",
                quantity="1",
                price="100",
                total="100",
            )
            account_id = account.id

        with db_override(session_factory), auth_as("user-b"):
            response = client.get(
                "/api/transactions", params={"trading_account_id": account_id}
            )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# place_order — server-owned price snapshot, deferred-market reservation,
# no-quote rejection, decimal validator (Blocker 5, Nit 14)
# ---------------------------------------------------------------------------


@pytest.fixture
def _alpaca_returns_no_quote(monkeypatch):
    """Stub `_fetch_from_alpaca` to raise so resolve_quote falls through
    every layer as a miss. The dev `.env` ships real Alpaca credentials,
    so without this `fetch_snapshot` returns a live quote and the no-quote
    rejection paths never fire. Redis is already isolated globally by the
    `_isolate_redis_from_dev_cache` autouse fixture in `conftest.py`."""
    from fastapi import HTTPException

    async def _raise_alpaca(_ticker):
        raise HTTPException(404, "Ticker not found")

    monkeypatch.setattr("app.services.quote_cache._fetch_from_alpaca", _raise_alpaca)


class TestPlaceMarketOrder:
    @pytest.fixture(autouse=True)
    def _force_market_open(self, monkeypatch):
        # The synchronous market-fill path is now gated on regular hours.
        # These tests cover the during-hours behavior — pin the clock so the
        # suite passes regardless of when it runs.
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: True
        )

    def test_market_order_uses_quote_as_reference_price_and_fills(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=150.0)
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        payload = {
            "trading_account_id": account_id,
            "ticker": "aapl",  # lowercase — clean_ticker should uppercase
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "gtc",
            "quantity": "1",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        # reference_price snapshots the quote we filled against
        assert Decimal(body["reference_price"]) == Decimal("150")
        assert body["status"] == "filled"
        assert body["ticker"] == "AAPL"

        # state checks: balance debited by fill_price × qty (not just quote × qty),
        # holding row created, one trade transaction emitted
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
            holding = db.query(Holding).filter(Holding.trading_account_id == account_id).first()
            assert holding is not None
            assert holding.quantity == Decimal("1")
            # Fill price has slippage applied; balance decrease must equal
            # quantity × fill_price (rounded to cents per Numeric(14,2)).
            fill_price = Decimal(body["average_fill_price"])
            expected_balance = (Decimal("10000") - Decimal("1") * fill_price).quantize(
                Decimal("0.01")
            )
            assert account.balance == expected_balance

    def test_market_order_rejected_with_no_quote(
        self, session_factory, _alpaca_returns_no_quote
    ):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            # NO quote — full miss path
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "gtc",
            "quantity": "1",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 400
        assert "no current price" in response.json()["detail"].lower()

        # State unchanged — no order, balance untouched
        with session_factory() as db:
            assert db.query(Order).count() == 0
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
            assert account.balance == Decimal("10000")

    def test_market_order_rejected_when_quote_price_is_null(
        self, session_factory, _alpaca_returns_no_quote
    ):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=None)  # row exists but no price
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )
        assert response.status_code == 400
        assert "no current price" in response.json()["detail"].lower()

    def test_market_order_accepts_fresh_data_event_timestamp_with_stale_updated_at(
        self, session_factory, _alpaca_returns_no_quote
    ):
        # Regression: the staleness check must read the data-event `timestamp`
        # field (refreshed by every WS trade or quote tick), NOT the
        # ORM-side `Quote.updated_at` (which the flush loop never writes).
        # Reproduces the user-reported "Quote for BTC/USD is stale (785s old)"
        # rejection. With the fix, this order must succeed at the seeded price
        # because `resolve_quote()` consults the data-event timestamp and the
        # warm-cache row is genuinely fresh.
        from datetime import datetime, timedelta, timezone
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            quote = seed_quote(db, "AAPL", price=150.0)  # default fresh timestamp
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id
            # Force `updated_at` 30 minutes in the past — the bug-case shape.
            # The Alpaca-fetch stub above ensures we cannot accidentally pass
            # by falling through to a real upstream fetch.
            quote.updated_at = datetime.now(timezone.utc) - timedelta(minutes=30)
            db.commit()

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )

        assert response.status_code == 200, response.text
        body = response.json()
        assert Decimal(body["reference_price"]) == Decimal("150")


class TestPlaceDeferredMarketOrder:
    """market + opg/cls TIF defers to the executor and reserves cash via rps."""

    def test_deferred_market_buy_reserves_balance_and_stays_open(
        self, session_factory, monkeypatch
    ):
        # Pin ATR to 0 so the reservation math is deterministic. Without this
        # the compute_atr fallback hits Alpaca synchronously and the rps
        # depends on whatever bar data the network returns.
        monkeypatch.setattr(
            "app.routers.orders.compute_atr", lambda ticker, db: Decimal("0")
        )
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=100.0)
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "opg",
            "quantity": "5",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        # Snapshot of placement-time price — the actual fill at the open will differ
        assert Decimal(body["reference_price"]) == Decimal("100")
        assert body["status"] == "open"
        # Decimal('0') with scale 8 stringifies as '0E-8' — accept either form
        assert Decimal(body["filled_quantity"]) == 0

        # Reservation: ATR pinned to 0, so rps = max(price*(1+0.02), price+1.5*0)
        #            = price * 1.02 = 102. Reservation = 5 * 102 = 510.
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
            assert account.reserved_balance == Decimal("510")
            # No transaction created — executor will fill at the open
            order = db.query(Order).first()
            assert order.reserved_per_share == Decimal("102")

    def test_deferred_market_buy_rejected_with_no_quote(
        self, session_factory, _alpaca_returns_no_quote
    ):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "opg",
                    "quantity": "1",
                },
            )
        assert response.status_code == 400
        assert "no current price" in response.json()["detail"].lower()
        with session_factory() as db:
            assert db.query(Order).count() == 0

    def test_compute_atr_runs_before_account_row_lock(
        self, session_factory, monkeypatch
    ):
        """ATR must be computed before the trading_account FOR UPDATE lock.

        compute_atr can fall through to a 10s synchronous Alpaca call when
        the local DB has no daily bars cached. If that call ran inside the
        FOR UPDATE block, every other writer on the same trading account
        would freeze for the full network timeout. This test pins the call
        order via side-effects on compute_atr and validate_order_request
        (the latter only runs after the lock is acquired).
        """
        call_order: list[str] = []

        def fake_atr(_ticker, _db):
            call_order.append("compute_atr")
            return Decimal("0")

        original_validate = __import__(
            "app.routers.orders", fromlist=["validate_order_request"]
        ).validate_order_request

        def tracking_validate(*args, **kwargs):
            call_order.append("validate_order_request")
            return original_validate(*args, **kwargs)

        monkeypatch.setattr("app.routers.orders.compute_atr", fake_atr)
        monkeypatch.setattr(
            "app.routers.orders.validate_order_request", tracking_validate
        )

        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=100.0)
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "opg",
            "quantity": "5",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        assert call_order == ["compute_atr", "validate_order_request"], (
            f"compute_atr must run before the FOR UPDATE lock + validation; "
            f"got {call_order}"
        )


class TestPlaceOrderInputValidation:
    def test_quantity_with_too_many_decimals_returns_clean_error(self, session_factory):
        # Quantity is stored as numeric(16,8). A 16-digit-fraction value should
        # not crash the route; the validator only verifies it parses as
        # Decimal, so this currently makes it through to SQLAlchemy. SQLite
        # is lax about precision so this may store with truncation, but the
        # response must not be a 500.
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=100.0)
            seed_daily_bar(db, "AAPL", volume=1_000_000)
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1.123456789012345",
                },
            )
        # Either a clean 200 (storage truncates) or a clean 400 — but never 500.
        assert response.status_code in (200, 400), response.text

    def test_quantity_non_numeric_string_returns_422(self, session_factory):
        # Pydantic field_validator validate_decimal raises ValueError → 422
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "not a number",
                },
            )
        assert response.status_code == 422
        # Confirm the detail names quantity, not some other field
        body = response.json()
        assert any(
            "quantity" in str(err.get("loc", [])).lower() for err in body["detail"]
        )

    def test_limit_price_non_numeric_string_returns_422(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="10000")
            account_id = account.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "limit",
                    "time_in_force": "gtc",
                    "quantity": "1",
                    "limit_price": "ten dollars",
                },
            )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# last_fill_at — N+1 avoidance returns latest timestamp per order (Should-fix 11)
# ---------------------------------------------------------------------------


class TestLastFillAt:
    def test_last_fill_at_returns_latest_transaction_timestamp(self, session_factory):
        from datetime import datetime, timedelta, timezone

        t1 = datetime(2025, 1, 15, 10, 0, tzinfo=timezone.utc)
        t2 = t1 + timedelta(minutes=5)
        t3 = t1 + timedelta(minutes=10)

        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            order = seed_order(
                db,
                account.id,
                "AAPL",
                side="buy",
                order_type="limit",
                limit_price="100",
                quantity="3",
                filled_quantity="3",
                status="filled",
            )
            for ts in (t1, t2, t3):
                seed_transaction(
                    db,
                    account.id,
                    order_id=order.id,
                    kind="trade",
                    ticker="AAPL",
                    side="buy",
                    quantity="1",
                    price="100",
                    total="100",
                    created_at=ts,
                )
            account_id = account.id
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.get(
                "/api/orders", params={"trading_account_id": account_id}
            )
        assert response.status_code == 200
        body = response.json()
        order_row = next(o for o in body["orders"] if o["id"] == order_id)
        assert order_row["last_fill_at"] is not None
        assert order_row["last_fill_at"].startswith(t3.isoformat()[:19])

    def test_orders_with_no_transactions_have_null_last_fill_at(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            order = seed_order(db, account.id, "AAPL", quantity="1")
            account_id = account.id
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.get(
                "/api/orders", params={"trading_account_id": account_id}
            )
        assert response.status_code == 200
        order_row = next(o for o in response.json()["orders"] if o["id"] == order_id)
        assert order_row["last_fill_at"] is None

    def test_get_single_order_includes_last_fill_at(self, session_factory):
        from datetime import datetime, timezone

        ts = datetime(2025, 6, 1, 14, 30, tzinfo=timezone.utc)
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            order = seed_order(
                db,
                account.id,
                "AAPL",
                quantity="1",
                filled_quantity="1",
                status="filled",
            )
            seed_transaction(
                db,
                account.id,
                order_id=order.id,
                ticker="AAPL",
                side="buy",
                quantity="1",
                price="100",
                total="100",
                created_at=ts,
            )
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.get(f"/api/orders/{order_id}")
        assert response.status_code == 200
        body = response.json()
        assert body["last_fill_at"] is not None
        assert body["last_fill_at"].startswith(ts.isoformat()[:19])


# ---------------------------------------------------------------------------
# cancel_order — partial-fill reservation release (Should-fix 12)
# ---------------------------------------------------------------------------


class TestCancelOrderReservationRelease:
    def test_cancel_partially_filled_limit_sell_releases_only_remaining_reserved(
        self, session_factory
    ):
        # Scenario: limit sell of 10 shares with 4 already filled. Remaining
        # 6 shares are reserved. Cancel must release exactly 6.
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            seed_holding(
                db,
                account.id,
                "AAPL",
                quantity="6",  # 4 already sold off
                reserved_quantity="6",  # remaining 6 shares are committed to this order
            )
            order = seed_order(
                db,
                account.id,
                "AAPL",
                side="sell",
                order_type="limit",
                limit_price="100",
                quantity="10",
                filled_quantity="4",
                status="partially_filled",
            )
            account_id = account.id
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(f"/api/orders/{order_id}/cancel")
        assert response.status_code == 200

        with session_factory() as db:
            holding = db.query(Holding).filter(
                Holding.trading_account_id == account_id, Holding.ticker == "AAPL"
            ).first()
            order = db.query(Order).filter(Order.id == order_id).first()
            # Released exactly 6 — not 10 (would underflow), not 0 (would leak)
            assert holding.reserved_quantity == Decimal("0")
            assert order.status == "cancelled"

    def test_cancel_partially_filled_limit_buy_releases_only_remaining_reserved_balance(
        self, session_factory
    ):
        # Scenario: limit buy of 10 shares at $100 with rps=$100; 3 filled.
        # Remaining 7 shares × $100 = $700 still reserved. Cancel releases $700.
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(
                db,
                "user-a",
                balance="10000",
                reserved_balance="700",  # 7 × $100 still reserved
            )
            order = seed_order(
                db,
                account.id,
                "AAPL",
                side="buy",
                order_type="limit",
                limit_price="100",
                reserved_per_share="100",
                quantity="10",
                filled_quantity="3",
                status="partially_filled",
            )
            account_id = account.id
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(f"/api/orders/{order_id}/cancel")
        assert response.status_code == 200

        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
            order = db.query(Order).filter(Order.id == order_id).first()
            assert account.reserved_balance == Decimal("0")
            assert order.status == "cancelled"

    def test_cancel_deferred_market_sell_releases_reserved_quantity(
        self, session_factory
    ):
        # deferred-market (market + opg/cls) sells reserve at placement
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            seed_holding(
                db,
                account.id,
                "AAPL",
                quantity="10",
                reserved_quantity="10",
            )
            order = seed_order(
                db,
                account.id,
                "AAPL",
                side="sell",
                order_type="market",
                limit_price=None,
                time_in_force="opg",
                quantity="10",
                status="open",
            )
            account_id = account.id
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(f"/api/orders/{order_id}/cancel")
        assert response.status_code == 200

        with session_factory() as db:
            holding = db.query(Holding).filter(
                Holding.trading_account_id == account_id, Holding.ticker == "AAPL"
            ).first()
            order = db.query(Order).filter(Order.id == order_id).first()
            assert holding.reserved_quantity == Decimal("0")
            assert order.status == "cancelled"

    def test_cannot_cancel_filled_order(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            order = seed_order(
                db,
                account.id,
                "AAPL",
                quantity="1",
                filled_quantity="1",
                status="filled",
            )
            order_id = order.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(f"/api/orders/{order_id}/cancel")
        assert response.status_code == 400
        assert "filled" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# _mock_order_response parity check (Nit 15)
# ---------------------------------------------------------------------------


class TestTransactionTradeColumnsCheckConstraint:
    """The CHECK constraint added in 0008 must reject malformed trade rows.

    Mirrors the CHECK in the SQLAlchemy model and Drizzle schema. SQLite
    enforces CHECK constraints at the storage layer, so this test runs
    against the same in-memory engine as the rest of the suite.
    """

    def _seed_account(self, factory):
        with factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a")
            return account.id

    def test_trade_with_null_order_id_is_rejected(self, session_factory):
        from sqlalchemy.exc import IntegrityError

        account_id = self._seed_account(session_factory)
        with session_factory() as db, pytest.raises(IntegrityError):
            seed_transaction(
                db,
                account_id,
                kind="trade",
                ticker="AAPL",
                side="buy",
                quantity="1",
                price="100",
                total="100",
            )

    def test_trade_with_null_ticker_is_rejected(self, session_factory):
        from sqlalchemy.exc import IntegrityError

        account_id = self._seed_account(session_factory)
        with session_factory() as db:
            order = seed_order(db, account_id, "AAPL", quantity="1")
            order_id = order.id
        with session_factory() as db, pytest.raises(IntegrityError):
            seed_transaction(
                db,
                account_id,
                order_id=order_id,
                kind="trade",
                side="buy",
                quantity="1",
                price="100",
                total="100",
            )

    def test_deposit_with_no_trade_columns_is_accepted(self, session_factory):
        account_id = self._seed_account(session_factory)
        with session_factory() as db:
            txn = seed_transaction(
                db,
                account_id,
                kind="deposit",
                total="500",
            )
            assert txn.id is not None
            assert txn.order_id is None
            assert txn.ticker is None

    def test_well_formed_trade_is_accepted(self, session_factory):
        account_id = self._seed_account(session_factory)
        with session_factory() as db:
            order = seed_order(db, account_id, "AAPL", quantity="1")
            txn = seed_transaction(
                db,
                account_id,
                order_id=order.id,
                kind="trade",
                ticker="AAPL",
                side="buy",
                quantity="1",
                price="100",
                total="100",
            )
            assert txn.id is not None


class TestStockMarketHoursGuard:
    """`market` + `day`/`gtc` on US equities must be rejected when the
    market is closed. Without this guard the synchronous fill path runs
    against the last cached `Quote.price`, which after hours is the prior
    session's close — so a "buy at the market" silently fills at a stale
    price. The Trade form already hides the combo client-side, but a
    direct API caller (curl, replay, custom client) bypasses that, so
    defense has to live in `place_order`. Tests stub
    `is_stock_market_open` to make the gate deterministic regardless of
    when the suite runs.
    """

    def _seed_for_market_buy(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=150.0)
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000")
            return account.id

    @pytest.mark.parametrize("tif", ["day", "gtc"])
    def test_market_off_hours_rejected_for_stock(
        self, session_factory, monkeypatch, tif
    ):
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: False
        )
        account_id = self._seed_for_market_buy(session_factory)

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": tif,
            "quantity": "1",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 400, response.text
        detail = response.json()["detail"].lower()
        assert "regular hours" in detail
        # No order persisted, balance untouched.
        with session_factory() as db:
            assert db.query(Order).count() == 0
            account = (
                db.query(TradingAccount)
                .filter(TradingAccount.id == account_id)
                .first()
            )
            assert account.balance == Decimal("10000")
            assert account.reserved_balance == Decimal("0")

    @pytest.mark.parametrize("tif", ["day", "gtc"])
    def test_market_during_hours_still_fills_for_stock(
        self, session_factory, monkeypatch, tif
    ):
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: True
        )
        account_id = self._seed_for_market_buy(session_factory)

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": tif,
            "quantity": "1",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "filled"
        assert Decimal(body["reference_price"]) == Decimal("150")

    def test_market_off_hours_works_for_crypto(
        self, session_factory, monkeypatch
    ):
        # Crypto is 24/7. Even if `is_stock_market_open` returns False the
        # guard must let crypto market orders through.
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: False
        )
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "BTC/USD", asset_class="crypto")
            seed_quote(db, "BTC/USD", price=50_000.0)
            seed_daily_bar(db, "BTC/USD", volume=1_000)
            account = seed_account(
                db, "user-a", balance="100000", type_="crypto"
            )
            account_id = account.id

        payload = {
            "trading_account_id": account_id,
            "ticker": "BTC/USD",
            "asset_class": "crypto",
            "side": "buy",
            "order_type": "market",
            # Frontend sends gtc; backend coerces to gtc anyway for crypto.
            "time_in_force": "gtc",
            "quantity": "0.01",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "filled"

    def test_market_opg_off_hours_defers_for_stock(
        self, session_factory, monkeypatch
    ):
        # `market` + `opg`/`cls` is the deferred-market path: reservation
        # is taken at placement time and the executor fills at the next
        # session boundary. Off-hours must NOT trigger the new guard,
        # since the synchronous fill path is skipped entirely.
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: False
        )
        # Pin ATR so the reservation math doesn't hit Alpaca.
        monkeypatch.setattr(
            "app.routers.orders.compute_atr", lambda _ticker, _db: Decimal("0")
        )
        account_id = self._seed_for_market_buy(session_factory)

        payload = {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "opg",
            "quantity": "1",
        }
        with db_override(session_factory), auth_as("user-a"):
            response = client.post("/api/orders", json=payload)

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "open"
        # Reservation taken at placement time so the buying-power check is
        # honest when the open eventually fires.
        with session_factory() as db:
            account = (
                db.query(TradingAccount)
                .filter(TradingAccount.id == account_id)
                .first()
            )
            assert account.reserved_balance > Decimal("0")


class TestPlaceOrderAccountTypeGuards:
    """Account-type / asset-class guard runs after membership verification but
    before the order row lock or any heavy math. Membership (403) wins over
    type (400) so a non-member can't probe a Kalshi account's existence."""

    @pytest.fixture(autouse=True)
    def _force_market_open(self, monkeypatch):
        monkeypatch.setattr(
            "app.routers.orders.is_stock_market_open", lambda _now_et: True
        )

    def _seed_kalshi_account(self, factory, user_id: str = "user-a") -> int:
        with factory() as db:
            seed_user(db, user_id)
            account = seed_account(
                db, user_id, name="Kalshi", balance="0", type_="kalshi",
            )
            return account.id

    def test_place_order_rejects_kalshi_account(self, session_factory):
        account_id = self._seed_kalshi_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )
        assert response.status_code == 400
        assert "/api/kalshi" in response.json()["detail"]
        with session_factory() as db:
            assert db.query(Order).count() == 0

    def test_place_order_rejects_investment_with_crypto_asset_class(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "BTC/USD", asset_class="crypto")
            account = seed_account(db, "user-a", balance="10000", type_="investment")
            account_id = account.id
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "BTC/USD",
                    "asset_class": "crypto",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "0.01",
                },
            )
        assert response.status_code == 400
        assert "us_equity" in response.json()["detail"]

    def test_place_order_rejects_crypto_with_us_equity_asset_class(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="10000", type_="crypto")
            account_id = account.id
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )
        assert response.status_code == 400
        assert "crypto" in response.json()["detail"].lower()

    def test_place_order_accepts_investment_with_us_equity(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=150.0)
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000", type_="investment")
            account_id = account.id
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "filled"

    def test_place_order_accepts_crypto_with_crypto(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "BTC/USD", asset_class="crypto")
            seed_quote(db, "BTC/USD", price=50_000.0)
            seed_daily_bar(db, "BTC/USD", volume=1_000)
            account = seed_account(db, "user-a", balance="100000", type_="crypto")
            account_id = account.id
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "BTC/USD",
                    "asset_class": "crypto",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "0.01",
                },
            )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "filled"

    def test_place_order_403_wins_over_400_for_non_member(self, session_factory):
        # A non-member of a Kalshi account must hit the 403 from the membership
        # check before the 400 from the type guard. Otherwise a Kalshi account's
        # existence leaks across users.
        account_id = self._seed_kalshi_account(session_factory, user_id="user-a")
        with session_factory() as db:
            seed_user(db, "user-b")
        with db_override(session_factory), auth_as("user-b"):
            response = client.post(
                "/api/orders",
                json={
                    "trading_account_id": account_id,
                    "ticker": "AAPL",
                    "asset_class": "us_equity",
                    "side": "buy",
                    "order_type": "market",
                    "time_in_force": "gtc",
                    "quantity": "1",
                },
            )
        assert response.status_code == 403


class TestMockOrderResponseParity:
    def test_mock_order_response_round_trips_through_order_response(self):
        """If a future field is added to OrderResponse but forgotten in
        _mock_order_response, the dev-mode SKIP_AUTH path will silently emit
        a stale shape. Round-tripping the dict back through OrderResponse
        catches that."""
        from app.routers.orders import PlaceOrderRequest, _mock_order_response

        payload = PlaceOrderRequest(
            trading_account_id=1,
            ticker="AAPL",
            asset_class="us_equity",
            side="buy",
            order_type="market",
            time_in_force="gtc",
            quantity="1",
        )
        mock = _mock_order_response(payload)
        # Round-trip: the model_dump must satisfy OrderResponse exactly.
        OrderResponse(**mock.model_dump())
