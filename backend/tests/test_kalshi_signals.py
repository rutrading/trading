from decimal import Decimal

import pytest

from app.strategies.kalshi.base import OrderIntent, get_strategy, list_strategies
from app.strategies.kalshi.signals import write_signal
from tests.integration_helpers import (
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_user,
)


def _setup():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    db = factory()
    seed_user(db, "u1")
    account = seed_account(db, "u1", type_="kalshi")
    return db, account


def _intent() -> OrderIntent:
    return OrderIntent(
        market_ticker="BTCD-26JAN0112-T100.0",
        side="yes",
        action="buy",
        count_fp=Decimal("1.00"),
        limit_price_dollars=Decimal("0.50"),
        rationale={"strategy": "threshold_drift", "edge": "0.20"},
    )


def test_write_signal_persists_emitted_with_intent():
    db, account = _setup()
    intent = _intent()
    row = write_signal(
        db,
        trading_account_id=account.id,
        strategy="threshold_drift",
        decision="emitted",
        intent=intent,
    )
    db.commit()
    assert row.trading_account_id == account.id
    assert row.market_ticker == intent.market_ticker
    assert row.strategy == "threshold_drift"
    assert row.side == "yes"
    assert row.action == "buy"
    assert row.count_fp == Decimal("1.00")
    assert row.limit_price_dollars == Decimal("0.50")
    assert row.decision == "emitted"
    assert row.snapshot == intent.rationale


def test_write_signal_persists_blocked_with_reason():
    db, account = _setup()
    row = write_signal(
        db,
        trading_account_id=account.id,
        strategy="threshold_drift",
        decision="blocked",
        market_ticker="BTCD-26JAN0112-T100.0",
        reason="no_subaccount",
    )
    db.commit()
    assert row.decision == "blocked"
    assert row.reason == "no_subaccount"
    assert row.market_ticker == "BTCD-26JAN0112-T100.0"
    assert row.side is None
    assert row.action is None
    assert row.count_fp is None
    assert row.limit_price_dollars is None


def test_write_signal_dry_run_uses_intent_fields():
    db, account = _setup()
    intent = _intent()
    row = write_signal(
        db,
        trading_account_id=account.id,
        strategy="momentum",
        decision="dry_run",
        intent=intent,
    )
    db.commit()
    assert row.decision == "dry_run"
    assert row.side == "yes"
    assert row.count_fp == Decimal("1.00")
    assert row.limit_price_dollars == Decimal("0.50")


def test_write_signal_returns_id():
    db, account = _setup()
    row = write_signal(
        db,
        trading_account_id=account.id,
        strategy="threshold_drift",
        decision="skipped",
        market_ticker="BTCD-26JAN0112-T100.0",
        reason="short_history",
    )
    assert row.id is not None


def test_registry_lists_three_strategies():
    import app.strategies.kalshi  # noqa: F401  ensure registration side effects

    assert list_strategies() == ["mean_reversion", "momentum", "threshold_drift"]


def test_get_strategy_unknown_raises_keyerror():
    with pytest.raises(KeyError):
        get_strategy("does_not_exist")
