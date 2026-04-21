"""Tests for the per-user order rate limiter.

Covers the core admit/reject semantics of PerUserRateLimiter (multi-window,
per-user isolation, sliding-window expiry) plus wiring into the /orders
router so a burst of placements from the same user gets 429s while a
different user keeps succeeding.
"""

import os

os.environ["SKIP_AUTH"] = "false"

import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.rate_limit import per_user as per_user_rate_limit
from app.rate_limit.per_user import Limit, PerUserRateLimiter
from tests.integration_helpers import (
    auth_as,
    db_override,
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_daily_bar,
    seed_quote,
    seed_symbol,
    seed_user,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    per_user_rate_limit._reset_for_tests()
    yield
    per_user_rate_limit._reset_for_tests()


@pytest.fixture
def session_factory():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    yield factory
    engine.dispose()


class TestPerUserRateLimiterUnit:
    async def test_admits_requests_under_limit(self):
        limiter = PerUserRateLimiter([Limit(max_requests=3, window_seconds=60)])
        for _ in range(3):
            await limiter.check("user-a")

    async def test_rejects_fourth_request_over_limit(self):
        limiter = PerUserRateLimiter([Limit(max_requests=3, window_seconds=60)])
        for _ in range(3):
            await limiter.check("user-a")
        with pytest.raises(HTTPException) as exc:
            await limiter.check("user-a")
        assert exc.value.status_code == 429

    async def test_different_users_are_isolated(self):
        limiter = PerUserRateLimiter([Limit(max_requests=2, window_seconds=60)])
        await limiter.check("user-a")
        await limiter.check("user-a")
        # user-a is saturated; user-b should still pass
        await limiter.check("user-b")
        await limiter.check("user-b")
        with pytest.raises(HTTPException):
            await limiter.check("user-a")
        with pytest.raises(HTTPException):
            await limiter.check("user-b")

    async def test_empty_user_id_is_no_op(self):
        """Defense in depth — an empty sub must not put every anonymous caller
        in the same bucket. The audit-mandated identity layer guarantees a sub,
        but make the limiter safe regardless."""
        limiter = PerUserRateLimiter([Limit(max_requests=1, window_seconds=60)])
        for _ in range(10):
            await limiter.check("")

    async def test_both_windows_must_admit(self):
        """With two windows, the tighter one gates bursts and the wider one
        gates sustained rate."""
        limiter = PerUserRateLimiter(
            [Limit(max_requests=2, window_seconds=1), Limit(max_requests=10, window_seconds=60)]
        )
        await limiter.check("user-a")
        await limiter.check("user-a")
        # 1s window is full → reject even though the 60s window has plenty of room
        with pytest.raises(HTTPException):
            await limiter.check("user-a")

    async def test_sliding_window_releases_after_expiry(self):
        limiter = PerUserRateLimiter([Limit(max_requests=2, window_seconds=0.1)])
        await limiter.check("user-a")
        await limiter.check("user-a")
        with pytest.raises(HTTPException):
            await limiter.check("user-a")
        # Wait for the window to slide past the first two timestamps
        time.sleep(0.15)
        await limiter.check("user-a")  # must not raise


class TestPlaceOrderRateLimit:
    """Integration: hammering POST /orders from the same user eventually 429s."""

    def _seed(self, factory):
        with factory() as db:
            seed_user(db, "user-a")
            seed_user(db, "user-b")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=100.0)
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account_a = seed_account(db, "user-a", balance="1000000")
            account_b = seed_account(db, "user-b", balance="1000000")
            return account_a.id, account_b.id

    def _payload(self, account_id: int) -> dict:
        return {
            "trading_account_id": account_id,
            "ticker": "AAPL",
            "asset_class": "us_equity",
            "side": "buy",
            "order_type": "market",
            "time_in_force": "gtc",
            "quantity": "1",
        }

    def test_sixth_placement_in_one_second_is_429(self, session_factory):
        account_a, _ = self._seed(session_factory)
        payload = self._payload(account_a)
        with db_override(session_factory), auth_as("user-a"):
            # 5 / sec is the tighter configured bucket — 6th request in the
            # same second should be rejected.
            for _ in range(5):
                response = client.post("/api/orders", json=payload)
                assert response.status_code == 200, response.text
            response = client.post("/api/orders", json=payload)
            assert response.status_code == 429
            assert "too many requests" in response.json()["detail"].lower()

    def test_another_user_is_not_affected_by_first_users_burst(self, session_factory):
        account_a, account_b = self._seed(session_factory)
        with db_override(session_factory), auth_as("user-a"):
            for _ in range(5):
                client.post("/api/orders", json=self._payload(account_a))
            response = client.post("/api/orders", json=self._payload(account_a))
            assert response.status_code == 429
        # Different user's bucket is untouched
        with db_override(session_factory), auth_as("user-b"):
            response = client.post("/api/orders", json=self._payload(account_b))
            assert response.status_code == 200, response.text


class TestCancelOrderRateLimit:
    """A burst of cancel calls eventually 429s — same cap as placement."""

    def test_sixth_cancel_in_one_second_is_429(self, session_factory):
        # Seed six open orders so five cancels succeed and the sixth is
        # guaranteed to hit the rate limit before the handler even runs.
        from tests.integration_helpers import seed_order

        with session_factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            account = seed_account(db, "user-a", balance="100000")
            order_ids = [
                seed_order(
                    db,
                    account.id,
                    "AAPL",
                    side="buy",
                    order_type="limit",
                    limit_price="100",
                    reserved_per_share="100",
                ).id
                for _ in range(6)
            ]

        with db_override(session_factory), auth_as("user-a"):
            for order_id in order_ids[:5]:
                response = client.post(f"/api/orders/{order_id}/cancel")
                assert response.status_code == 200, response.text
            response = client.post(f"/api/orders/{order_ids[5]}/cancel")
            assert response.status_code == 429
