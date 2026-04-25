"""Integration tests for the /api/accounts reset and deposit endpoints."""

import os

# SKIP_AUTH must be off so the router auth/membership branches actually run.
os.environ["SKIP_AUTH"] = "false"

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.db.models import AccountMember, Holding, Order, TradingAccount, Transaction
from app.main import app
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_holding,
    seed_order,
    seed_symbol,
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


def _seed_full_account(factory, user_id: str = "user-a") -> int:
    """Seed an account with orders, holdings, and trade transactions so reset
    has something to wipe. Returns the account id."""
    with factory() as db:
        seed_user(db, user_id)
        seed_symbol(db, "AAPL")
        account = seed_account(db, user_id, balance="9000")
        order = seed_order(
            db, account.id, "AAPL",
            side="buy", order_type="limit", limit_price="100",
            reserved_per_share="100",
        )
        seed_holding(db, account.id, "AAPL", quantity="5", average_cost="100")
        seed_transaction(
            db, account.id,
            order_id=order.id, kind="trade", ticker="AAPL",
            side="buy", quantity="5", price="100", total="500",
        )
        seed_transaction(
            db, account.id, kind="deposit", total="10000",
        )
        return account.id


class TestResetAccount:
    def test_reset_wipes_orders_holdings_transactions(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "expert"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            assert db.query(Order).filter(Order.trading_account_id == account_id).count() == 0
            assert db.query(Holding).filter(Holding.trading_account_id == account_id).count() == 0
            trades = (
                db.query(Transaction)
                .filter(
                    Transaction.trading_account_id == account_id,
                    Transaction.kind == "trade",
                )
                .count()
            )
            assert trades == 0

    def test_reset_creates_seed_deposit(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "expert"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            txns = (
                db.query(Transaction)
                .filter(Transaction.trading_account_id == account_id)
                .all()
            )
            assert len(txns) == 1
            txn = txns[0]
            assert txn.kind == "deposit"
            assert txn.total == Decimal("10000.00")
            assert txn.ticker is None
            assert txn.side is None
            assert txn.quantity is None
            assert txn.price is None
            assert txn.order_id is None

    def test_reset_resets_balance_and_experience_level(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "intermediate"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).one()
            assert account.balance == Decimal("50000.00")
            assert account.reserved_balance == Decimal("0")
            assert account.experience_level == "intermediate"

    def test_reset_preserves_other_accounts(self, session_factory):
        account_a = _seed_full_account(session_factory, user_id="user-a")
        with session_factory() as db:
            seed_user(db, "user-b")
            seed_symbol(db, "TSLA")
            account_b = seed_account(db, "user-b", name="B", balance="2500")
            seed_holding(db, account_b.id, "TSLA", quantity="3", average_cost="200")
            seed_transaction(db, account_b.id, kind="deposit", total="2500")
            account_b_id = account_b.id

        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_a}/reset",
                json={"experience_level": "beginner"},
            )
        assert response.status_code == 200

        with session_factory() as db:
            assert (
                db.query(Holding)
                .filter(Holding.trading_account_id == account_b_id)
                .count()
                == 1
            )
            assert (
                db.query(Transaction)
                .filter(Transaction.trading_account_id == account_b_id)
                .count()
                == 1
            )
            account_b_row = db.query(TradingAccount).filter(TradingAccount.id == account_b_id).one()
            assert account_b_row.balance == Decimal("2500")

    def test_reset_preserves_account_members(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "expert"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            members = (
                db.query(AccountMember)
                .filter(AccountMember.account_id == account_id)
                .all()
            )
            assert len(members) == 1
            assert members[0].user_id == "user-a"

    def test_reset_403_for_non_member(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with session_factory() as db:
            seed_user(db, "user-b")
        with db_override(session_factory), auth_as("user-b"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "expert"},
            )
        assert response.status_code == 403

    def test_reset_404_for_missing_account(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/accounts/999/reset",
                json={"experience_level": "expert"},
            )
        assert response.status_code == 404

    def test_reset_invalid_experience_level_422(self, session_factory):
        account_id = _seed_full_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/reset",
                json={"experience_level": "godmode"},
            )
        assert response.status_code == 422


class TestDeposit:
    def _seed_simple_account(self, factory, balance: str = "1000") -> int:
        with factory() as db:
            seed_user(db, "user-a")
            account = seed_account(db, "user-a", balance=balance)
            return account.id

    def test_deposit_increments_balance_and_creates_transaction(self, session_factory):
        account_id = self._seed_simple_account(session_factory, balance="1000")
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                json={"amount": "500"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).one()
            assert account.balance == Decimal("1500.00")
            txns = (
                db.query(Transaction)
                .filter(Transaction.trading_account_id == account_id)
                .all()
            )
            assert len(txns) == 1
            txn = txns[0]
            assert txn.kind == "deposit"
            assert txn.total == Decimal("500.00")
            assert txn.ticker is None
            assert txn.side is None
            assert txn.quantity is None
            assert txn.price is None
            assert txn.order_id is None

    def test_deposit_amount_zero_rejected_422(self, session_factory):
        account_id = self._seed_simple_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                json={"amount": "0"},
            )
        assert response.status_code == 422

    def test_deposit_amount_negative_rejected_422(self, session_factory):
        account_id = self._seed_simple_account(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                json={"amount": "-100"},
            )
        assert response.status_code == 422

    def test_deposit_quantizes_to_two_decimals(self, session_factory):
        account_id = self._seed_simple_account(session_factory, balance="0")
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                # Banker's rounding (ROUND_HALF_EVEN): 100.005 → 100.00
                json={"amount": "100.005"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).one()
            assert account.balance == Decimal("100.00")

    def test_deposit_403_for_non_member(self, session_factory):
        account_id = self._seed_simple_account(session_factory)
        with session_factory() as db:
            seed_user(db, "user-b")
        with db_override(session_factory), auth_as("user-b"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                json={"amount": "100"},
            )
        assert response.status_code == 403

    def test_deposit_404_for_missing_account(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                "/api/accounts/999/deposits",
                json={"amount": "100"},
            )
        assert response.status_code == 404

    def test_deposit_does_not_modify_reserved_balance(self, session_factory):
        with session_factory() as db:
            seed_user(db, "user-a")
            account = seed_account(
                db, "user-a", balance="1000", reserved_balance="250",
            )
            account_id = account.id
        with db_override(session_factory), auth_as("user-a"):
            response = client.post(
                f"/api/accounts/{account_id}/deposits",
                json={"amount": "100"},
            )
        assert response.status_code == 200
        with session_factory() as db:
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).one()
            assert account.balance == Decimal("1100.00")
            assert account.reserved_balance == Decimal("250")
