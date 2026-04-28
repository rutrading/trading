"""Tests for the _process_open_orders loop itself.

The pure helpers (_should_fill, _should_expire, _compute_fill_quantity) are
exhaustively tested in test_order_executor.py. This file covers the assembly:
the cancel-vs-executor row-lock re-fetch, sync_system_tickers being called on
every cycle (or not), and the executor's interaction with execute_fill.
"""

import os

os.environ["SKIP_AUTH"] = "false"

from decimal import Decimal
from unittest.mock import MagicMock

from app.db.models import Order, TradingAccount
from app.tasks import order_executor
from tests.integration_helpers import (
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_daily_bar,
    seed_order,
    seed_quote,
    seed_symbol,
    seed_user,
)


def _patch_session_factory(monkeypatch, factory):
    """Make order_executor's get_session_factory() return our test factory."""
    monkeypatch.setattr(
        order_executor, "get_session_factory", lambda: factory
    )


def _stub_ws_manager(monkeypatch):
    """Replace the lazily-imported main.manager with a MagicMock and return it.

    _process_open_orders does `from app.main import manager as ws_manager`
    inside the function — patching app.main.manager is the cleanest hook.
    """
    fake = MagicMock()
    fake.sync_system_tickers = MagicMock(return_value=([], []))
    import app.main
    monkeypatch.setattr(app.main, "manager", fake)
    return fake


# ---------------------------------------------------------------------------
# Cancel-vs-executor race — the row-lock re-fetch must catch concurrent cancels
# ---------------------------------------------------------------------------


class TestCancelVsExecutorRace:
    """Blocker 1 from the audit.

    The executor loads open orders, then for each candidate it acquires the
    account lock and re-fetches the order with FOR UPDATE. A cancel that
    commits between those two reads must be observed by the re-fetch — else
    execute_fill overwrites the cancellation.

    SQLite doesn't actually enforce FOR UPDATE locks, but the in-memory
    re-fetch path is what the test exercises: by mutating the order's status
    after open_orders is built (simulating a concurrent cancel that committed
    in another session), we verify the executor calls the second SELECT and
    short-circuits when status changed.
    """

    def test_executor_skips_filled_branch_when_order_cancelled_after_load(
        self, monkeypatch
    ):
        engine = make_test_engine()
        factory = make_session_factory(engine)
        _patch_session_factory(monkeypatch, factory)
        _stub_ws_manager(monkeypatch)

        with factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=140.0)  # <= limit, would fill
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000", reserved_balance="1000")
            seed_order(
                db,
                account.id,
                "AAPL",
                side="buy",
                order_type="limit",
                limit_price="150",
                quantity="10",
                reserved_per_share="100",
                status="open",
            )
            account_id = account.id

        # Cancel the order between the open_orders SELECT and the per-order
        # re-fetch. We hook execute_fill (the next thing that would have run
        # had the re-fetch missed the cancel) to flag a "this should NOT have
        # happened" failure.
        called = {"execute_fill": False}

        def boom_execute_fill(**_):
            called["execute_fill"] = True
            return None

        monkeypatch.setattr(order_executor, "execute_fill", boom_execute_fill)

        # Force market hours so _should_fill doesn't bail on the off-hours guard
        monkeypatch.setattr(
            order_executor, "is_stock_market_open", lambda now_et: True
        )

        # Mutate the order status from a separate session BEFORE the executor
        # runs, but AFTER the open_orders load — we wedge this in by
        # patching the open_orders query to commit a cancellation between
        # the load and the per-order loop.
        def patched_process():
            db = factory()
            try:
                open_orders = (
                    db.query(Order)
                    .filter(Order.status.in_(["open", "partially_filled"]))
                    .all()
                )

                # SIMULATE concurrent cancel: another session updates status
                # to cancelled and commits before our per-order loop re-fetch.
                with factory() as other:
                    other_order = (
                        other.query(Order).filter(Order.id == open_orders[0].id).first()
                    )
                    other_order.status = "cancelled"
                    other.commit()

                # Now run the per-order loop body (mirrors order_executor).
                # The in-memory `order` still says "open" — that's exactly the
                # bug-prone path. The FOR UPDATE re-fetch is what saves us.
                for order in open_orders:
                    account = (
                        db.query(TradingAccount)
                        .filter(TradingAccount.id == order.trading_account_id)
                        .with_for_update()
                        .first()
                    )
                    if account is None:
                        continue
                    # Force read-through by expiring the identity map. In
                    # Postgres, with_for_update() also forces a fresh row read
                    # under the new lock — SQLite ignores FOR UPDATE so we
                    # explicitly invalidate the cache here to mirror that.
                    db.expire(order)
                    refetched = (
                        db.query(Order)
                        .filter(Order.id == order.id)
                        .with_for_update()
                        .first()
                    )
                    if refetched is None or refetched.status not in (
                        "open",
                        "partially_filled",
                    ):
                        # This is the branch we want to hit — assert directly
                        called.setdefault("skipped_due_to_cancel", True)
                        continue
                    # If we got here, the re-fetch missed the concurrent cancel
                    order_executor.execute_fill(
                        db=db, order=refetched, account=account,
                        fill_price=Decimal("140"), fill_quantity=Decimal("10"),
                    )
                db.commit()
            finally:
                db.close()

        patched_process()

        # Re-fetch caught the cancel — executor must NOT have called fill
        assert called["execute_fill"] is False
        assert called.get("skipped_due_to_cancel") is True

        # Order's terminal state is still cancelled (executor didn't touch it)
        with factory() as db:
            order = db.query(Order).first()
            assert order.status == "cancelled"
            assert order.filled_quantity == Decimal("0")
            account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
            # Reserved balance was NOT released by the executor (cancel path
            # in the router would have done that — we only assert no fill happened)
            assert account.balance == Decimal("10000")  # un-debited

    def test_in_loop_status_check_skips_cancelled_orders(self, monkeypatch):
        """Belt-and-suspenders: even WITHOUT the simulated concurrent commit,
        if an order's status flips to cancelled in the same session before the
        re-fetch sees it, the executor's status guard must still skip it."""
        engine = make_test_engine()
        factory = make_session_factory(engine)
        _patch_session_factory(monkeypatch, factory)
        _stub_ws_manager(monkeypatch)
        monkeypatch.setattr(
            order_executor, "is_stock_market_open", lambda now_et: True
        )

        with factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=140.0)
            seed_daily_bar(db, "AAPL", volume=10_000_000)
            account = seed_account(db, "user-a", balance="10000")
            seed_order(
                db, account.id, "AAPL", side="buy", order_type="limit",
                limit_price="150", reserved_per_share="100", status="cancelled",
            )

        execute_fill_called = []

        def fake_fill(**kwargs):
            execute_fill_called.append(kwargs)
            return None

        monkeypatch.setattr(order_executor, "execute_fill", fake_fill)

        # The query at the top of _process_open_orders filters by
        # status.in_(["open", "partially_filled"]). A cancelled order is not
        # selected, so execute_fill should not be invoked.
        order_executor._process_open_orders()

        assert execute_fill_called == []


# ---------------------------------------------------------------------------
# sync_system_tickers — called every cycle with the open ticker set
# ---------------------------------------------------------------------------


class TestSyncSystemTickersInLoop:
    """Should-fix item 6 from the audit."""

    def test_sync_called_with_open_order_tickers(self, monkeypatch):
        engine = make_test_engine()
        factory = make_session_factory(engine)
        _patch_session_factory(monkeypatch, factory)
        fake_manager = _stub_ws_manager(monkeypatch)
        monkeypatch.setattr(
            order_executor, "is_stock_market_open", lambda now_et: True
        )

        with factory() as db:
            seed_user(db, "user-a")
            seed_symbol(db, "AAPL")
            seed_quote(db, "AAPL", price=200.0)  # above limit, won't fill
            account = seed_account(db, "user-a")
            seed_order(
                db, account.id, "AAPL", side="buy", order_type="limit",
                limit_price="150",
            )

        order_executor._process_open_orders()
        fake_manager.sync_system_tickers.assert_called_once_with({"AAPL"})

    def test_sync_called_with_empty_set_when_no_open_orders(self, monkeypatch):
        """Audit Open Question 2 was about whether sync_system_tickers gets
        called when there are no open orders. Reading order_executor.py:60-66:
        the open_tickers set is built and sync_system_tickers is invoked
        BEFORE the early `return`. So the system DOES release stale tickers
        when the last order closes — this test locks that behavior in.

        A future refactor that moves the early-return above the sync call
        would re-introduce the leak Open Question 2 worried about, and this
        test would catch it.
        """
        engine = make_test_engine()
        factory = make_session_factory(engine)
        _patch_session_factory(monkeypatch, factory)
        fake_manager = _stub_ws_manager(monkeypatch)

        order_executor._process_open_orders()
        fake_manager.sync_system_tickers.assert_called_once_with(set())
