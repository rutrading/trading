"""Integration tests for the /api/kalshi router.

The router is account-scoped via ``kalshi_account.user_id``: every endpoint
operates on the caller's single Kalshi account, so IDOR coverage focuses on
making sure user A's signals/orders/positions/fills never appear in user B's
responses.
"""

import os

# SKIP_AUTH must be off so the router auth/membership branches actually run.
os.environ["SKIP_AUTH"] = "false"

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.db.models import (
    KalshiAccount,
    KalshiBotState,
    KalshiFill,
    KalshiMarket,
    KalshiOrder,
    KalshiPosition,
    KalshiSignal,
)
from app.main import app
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_user,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _enable_kalshi(monkeypatch):
    """The repo-local ``backend/.env`` may set ``KALSHI_ENABLED=false`` (the
    operator's chosen production posture); ``app.main`` loads it via
    ``load_dotenv`` at import time. Force the master switch on for every
    router test so the dependency-level 503 gate doesn't short-circuit the
    handlers under test. ``TestMasterKillSwitch`` overrides this back to
    false per-test to exercise the gate."""
    monkeypatch.setenv("KALSHI_ENABLED", "true")


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


def _seed_kalshi_user(
    factory,
    user_id: str,
    *,
    subaccount_number: int | None = None,
    status: str = "local_only",
    active_strategy: str = "threshold_drift",
    automation_enabled: bool = False,
    paused: bool = False,
    dry_run: bool = True,
    last_balance_dollars: Decimal | None = None,
) -> int:
    """Seed user, kalshi trading_account, kalshi_account, and kalshi_bot_state.
    Returns the trading_account_id.
    """
    with factory() as db:
        seed_user(db, user_id)
        account = seed_account(db, user_id, type_="kalshi", name="kalshi")
        db.add(
            KalshiAccount(
                trading_account_id=account.id,
                user_id=user_id,
                subaccount_number=subaccount_number,
                status=status,
                last_balance_dollars=last_balance_dollars,
            )
        )
        db.add(
            KalshiBotState(
                trading_account_id=account.id,
                active_strategy=active_strategy,
                automation_enabled=automation_enabled,
                paused=paused,
                dry_run=dry_run,
            )
        )
        db.commit()
        return account.id


def _seed_user_no_kalshi(factory, user_id: str) -> int:
    """Seed user + a kalshi-typed trading account but no kalshi_account row."""
    with factory() as db:
        seed_user(db, user_id)
        account = seed_account(db, user_id, type_="kalshi", name="kalshi")
        return account.id


def _ensure_market(db, ticker: str = "KXBTCD-T1") -> None:
    if db.query(KalshiMarket).filter(KalshiMarket.ticker == ticker).first():
        return
    db.add(KalshiMarket(ticker=ticker, series_ticker="KXBTCD"))
    db.commit()


def _seed_signal(
    factory, account_id: int, *, strategy: str = "threshold_drift"
) -> int:
    with factory() as db:
        _ensure_market(db)
        row = KalshiSignal(
            trading_account_id=account_id,
            market_ticker="KXBTCD-T1",
            strategy=strategy,
            decision="emitted",
        )
        db.add(row)
        db.commit()
        return row.id


def _seed_order(factory, account_id: int) -> int:
    with factory() as db:
        _ensure_market(db)
        row = KalshiOrder(
            trading_account_id=account_id,
            client_order_id=f"co-{account_id}-{datetime.now(timezone.utc).timestamp()}",
            market_ticker="KXBTCD-T1",
            side="yes",
            action="buy",
            order_type="limit",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.50"),
            status="pending",
            strategy="threshold_drift",
        )
        db.add(row)
        db.commit()
        return row.id


def _seed_position(factory, account_id: int) -> int:
    with factory() as db:
        _ensure_market(db)
        row = KalshiPosition(
            trading_account_id=account_id,
            market_ticker="KXBTCD-T1",
            position_fp=Decimal("1.00"),
        )
        db.add(row)
        db.commit()
        return row.id


def _seed_fill(factory, account_id: int) -> int:
    with factory() as db:
        _ensure_market(db)
        row = KalshiFill(
            trading_account_id=account_id,
            kalshi_fill_id=f"fill-{account_id}-{datetime.now(timezone.utc).timestamp()}",
            market_ticker="KXBTCD-T1",
            side="yes",
            action="buy",
            count_fp=Decimal("1.00"),
            executed_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        return row.id


# ---------------------------------------------------------------------------
# Status / 404 / auth
# ---------------------------------------------------------------------------


class TestStatus:
    def test_returns_404_when_no_kalshi_account(self, session_factory):
        _seed_user_no_kalshi(session_factory, "u1")
        with db_override(session_factory), auth_as("u1"):
            response = client.get("/api/kalshi/status")
        assert response.status_code == 404
        assert "No Kalshi account" in response.json()["detail"]

    def test_returns_account_and_bot_state(self, session_factory):
        _seed_kalshi_user(
            session_factory,
            "u1",
            subaccount_number=7,
            status="active",
            active_strategy="momentum",
            last_balance_dollars=Decimal("1500.123456"),
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.get("/api/kalshi/status")
        assert response.status_code == 200
        body = response.json()
        assert body["account"]["subaccount_number"] == 7
        assert body["account"]["status"] == "active"
        assert body["account"]["last_balance_dollars"] == "1500.123456"
        assert body["bot_state"]["active_strategy"] == "momentum"
        assert body["bot_state"]["dry_run"] is True
        assert body["bot_state"]["automation_enabled"] is False


class TestUnauthenticated:
    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("get", "/api/kalshi/status", None),
            ("post", "/api/kalshi/provision-subaccount", None),
            ("get", "/api/kalshi/signals", None),
            ("get", "/api/kalshi/orders", None),
            ("get", "/api/kalshi/positions", None),
            ("get", "/api/kalshi/fills", None),
            ("post", "/api/kalshi/strategy", {"strategy": "momentum"}),
            ("post", "/api/kalshi/control", {"paused": True}),
        ],
    )
    def test_no_bearer_returns_401(
        self, session_factory, method, path, body
    ):
        with db_override(session_factory):
            request = getattr(client, method)
            response = request(path, json=body) if body is not None else request(path)
        assert response.status_code == 401


class TestMasterKillSwitch:
    """KALSHI_ENABLED=false short-circuits every endpoint with 503 before the
    auth dependency runs, so the gate fires even on unauthenticated probes.
    The default-true behaviour is covered implicitly by every other test in
    this module (none of which set the env var)."""

    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("get", "/api/kalshi/status", None),
            ("post", "/api/kalshi/provision-subaccount", None),
            ("get", "/api/kalshi/signals", None),
            ("get", "/api/kalshi/orders", None),
            ("get", "/api/kalshi/positions", None),
            ("get", "/api/kalshi/fills", None),
            ("post", "/api/kalshi/strategy", {"strategy": "momentum"}),
            ("post", "/api/kalshi/control", {"paused": True}),
        ],
    )
    def test_disabled_returns_503(
        self, monkeypatch, session_factory, method, path, body
    ):
        monkeypatch.setenv("KALSHI_ENABLED", "false")
        with db_override(session_factory), auth_as("u1"):
            request = getattr(client, method)
            response = request(path, json=body) if body is not None else request(path)
        assert response.status_code == 503
        assert response.json()["detail"] == "Kalshi service disabled"


# ---------------------------------------------------------------------------
# Provision subaccount
# ---------------------------------------------------------------------------


class TestProvisionSubaccount:
    def test_success_updates_db(self, monkeypatch, session_factory):
        account_id = _seed_kalshi_user(
            session_factory, "u1", status="local_only"
        )
        from app.services import kalshi_rest

        monkeypatch.setattr(
            kalshi_rest,
            "create_subaccount",
            AsyncMock(return_value={"subaccount_number": 7}),
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post("/api/kalshi/provision-subaccount")
        assert response.status_code == 200
        assert response.json()["subaccount_number"] == 7
        assert response.json()["status"] == "active"

        with session_factory() as db:
            acc = (
                db.query(KalshiAccount)
                .filter(KalshiAccount.trading_account_id == account_id)
                .one()
            )
            assert acc.subaccount_number == 7
            assert acc.status == "active"
            assert acc.provisioning_error is None

    def test_idempotent_on_already_active(
        self, monkeypatch, session_factory
    ):
        _seed_kalshi_user(
            session_factory, "u1", subaccount_number=3, status="active"
        )
        from app.services import kalshi_rest

        called = AsyncMock()
        monkeypatch.setattr(kalshi_rest, "create_subaccount", called)

        with db_override(session_factory), auth_as("u1"):
            response = client.post("/api/kalshi/provision-subaccount")
        assert response.status_code == 200
        assert response.json()["subaccount_number"] == 3
        assert called.await_count == 0

    def test_failure_marks_failed(self, monkeypatch, session_factory):
        account_id = _seed_kalshi_user(
            session_factory, "u1", status="local_only"
        )
        from app.services import kalshi_rest

        monkeypatch.setattr(
            kalshi_rest,
            "create_subaccount",
            AsyncMock(side_effect=RuntimeError("kalshi blew up")),
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post("/api/kalshi/provision-subaccount")
        assert response.status_code == 502
        assert "kalshi blew up" in response.json()["detail"]

        with session_factory() as db:
            acc = (
                db.query(KalshiAccount)
                .filter(KalshiAccount.trading_account_id == account_id)
                .one()
            )
            assert acc.status == "failed"
            assert acc.provisioning_error == "kalshi blew up"
            assert acc.subaccount_number is None


# ---------------------------------------------------------------------------
# Strategy
# ---------------------------------------------------------------------------


class TestStrategyEndpoint:
    def test_validates_name(self, session_factory):
        _seed_kalshi_user(session_factory, "u1")
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/strategy", json={"strategy": "unknown"}
            )
        assert response.status_code == 400
        assert "Unknown strategy" in response.json()["detail"]

    def test_updates_active_strategy(self, session_factory):
        account_id = _seed_kalshi_user(session_factory, "u1")
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/strategy", json={"strategy": "momentum"}
            )
        assert response.status_code == 200
        assert response.json()["active_strategy"] == "momentum"
        with session_factory() as db:
            state = (
                db.query(KalshiBotState)
                .filter(KalshiBotState.trading_account_id == account_id)
                .one()
            )
            assert state.active_strategy == "momentum"


# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------


class TestControlEndpoint:
    def test_partial_update_only_changes_provided_fields(
        self, session_factory
    ):
        account_id = _seed_kalshi_user(
            session_factory,
            "u1",
            automation_enabled=True,
            dry_run=True,
            paused=False,
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/control", json={"paused": True}
            )
        assert response.status_code == 200
        body = response.json()
        assert body["paused"] is True
        assert body["automation_enabled"] is True
        assert body["dry_run"] is True

        with session_factory() as db:
            state = (
                db.query(KalshiBotState)
                .filter(KalshiBotState.trading_account_id == account_id)
                .one()
            )
            assert state.paused is True
            assert state.automation_enabled is True
            assert state.dry_run is True

    def test_blocks_non_dry_run_without_subaccount(self, session_factory):
        account_id = _seed_kalshi_user(
            session_factory,
            "u1",
            subaccount_number=None,
            automation_enabled=False,
            dry_run=True,
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/control",
                json={"dry_run": False, "automation_enabled": True},
            )
        assert response.status_code == 400
        assert "Provision a Kalshi subaccount" in response.json()["detail"]

        with session_factory() as db:
            state = (
                db.query(KalshiBotState)
                .filter(KalshiBotState.trading_account_id == account_id)
                .one()
            )
            assert state.automation_enabled is False
            assert state.dry_run is True

    def test_allows_non_dry_run_with_subaccount(self, session_factory):
        account_id = _seed_kalshi_user(
            session_factory,
            "u1",
            subaccount_number=5,
            automation_enabled=False,
            dry_run=True,
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/control",
                json={"dry_run": False, "automation_enabled": True},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["automation_enabled"] is True
        assert body["dry_run"] is False

        with session_factory() as db:
            state = (
                db.query(KalshiBotState)
                .filter(KalshiBotState.trading_account_id == account_id)
                .one()
            )
            assert state.automation_enabled is True
            assert state.dry_run is False

    def test_allows_dry_run_off_alone_when_automation_off(
        self, session_factory
    ):
        account_id = _seed_kalshi_user(
            session_factory,
            "u1",
            subaccount_number=None,
            automation_enabled=False,
            dry_run=True,
        )
        with db_override(session_factory), auth_as("u1"):
            response = client.post(
                "/api/kalshi/control", json={"dry_run": False}
            )
        assert response.status_code == 200
        with session_factory() as db:
            state = (
                db.query(KalshiBotState)
                .filter(KalshiBotState.trading_account_id == account_id)
                .one()
            )
            assert state.dry_run is False
            assert state.automation_enabled is False


# ---------------------------------------------------------------------------
# Read endpoints — IDOR scoping + limit
# ---------------------------------------------------------------------------


class TestReadEndpointsScoping:
    def _seed_two_users(self, session_factory):
        account_a = _seed_kalshi_user(session_factory, "user-a")
        account_b = _seed_kalshi_user(session_factory, "user-b")
        return account_a, account_b

    def test_signals_scoped_to_current_user(self, session_factory):
        a, b = self._seed_two_users(session_factory)
        signal_a = _seed_signal(session_factory, a)
        _seed_signal(session_factory, b)

        with db_override(session_factory), auth_as("user-a"):
            response = client.get("/api/kalshi/signals")
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["id"] == signal_a

    def test_orders_scoped_to_current_user(self, session_factory):
        a, b = self._seed_two_users(session_factory)
        order_a = _seed_order(session_factory, a)
        _seed_order(session_factory, b)

        with db_override(session_factory), auth_as("user-a"):
            response = client.get("/api/kalshi/orders")
        assert response.status_code == 200
        rows = response.json()
        assert [r["id"] for r in rows] == [order_a]

    def test_positions_scoped_to_current_user(self, session_factory):
        a, b = self._seed_two_users(session_factory)
        _seed_position(session_factory, a)
        _seed_position(session_factory, b)

        with db_override(session_factory), auth_as("user-a"):
            response = client.get("/api/kalshi/positions")
        assert response.status_code == 200
        rows = response.json()
        assert len(rows) == 1
        assert rows[0]["market_ticker"] == "KXBTCD-T1"

    def test_fills_scoped_to_current_user(self, session_factory):
        a, b = self._seed_two_users(session_factory)
        fill_a = _seed_fill(session_factory, a)
        _seed_fill(session_factory, b)

        with db_override(session_factory), auth_as("user-a"):
            response = client.get("/api/kalshi/fills")
        assert response.status_code == 200
        rows = response.json()
        assert [r["id"] for r in rows] == [fill_a]


class TestSignalsLimit:
    def test_respects_limit_param(self, session_factory):
        account_id = _seed_kalshi_user(session_factory, "u1")
        for _ in range(7):
            _seed_signal(session_factory, account_id)
        with db_override(session_factory), auth_as("u1"):
            response = client.get("/api/kalshi/signals?limit=5")
        assert response.status_code == 200
        assert len(response.json()) == 5
