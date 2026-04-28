"""Drift guards for the Kalshi schema duplicated across Drizzle and SQLAlchemy.

`web/src/db/schema.ts` is the source of truth and `backend/app/db/models.py`
mirrors it. SQLite ignores Postgres enum constraints and CHECK constraints by
default, so several tests here parse the TS source directly or assert on the
SQLAlchemy metadata instead of trying to provoke a database-level violation.
"""

import re
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    KalshiAccount,
    KalshiOrder,
    KalshiSignal,
    account_type_enum,
    kalshi_account_status_enum,
    kalshi_order_status_enum,
    kalshi_signal_decision_enum,
)
from tests.integration_helpers import (
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_user,
)

_TS_PATH = Path(__file__).parents[2] / "web/src/db/schema.ts"


def _ts_enum_values(ts_const_name: str, pg_name: str) -> list[str]:
    text = _TS_PATH.read_text()
    block = re.search(
        rf'{ts_const_name}\s*=\s*pgEnum\(\s*"{pg_name}"\s*,'
        r"\s*\[(.*?)\]\s*\)",
        text,
        re.DOTALL,
    )
    assert block is not None, (
        f"Could not locate {ts_const_name} declaration in schema.ts; "
        "the regex needs updating."
    )
    return re.findall(r'"(\w+)"', block.group(1))


def test_account_type_enum_includes_kalshi() -> None:
    ts_values = _ts_enum_values("accountTypeEnum", "account_type")
    assert ts_values == ["investment", "crypto", "kalshi"]
    assert tuple(account_type_enum.enums) == ("investment", "crypto", "kalshi")


def test_kalshi_order_status_enum_values() -> None:
    expected = ["pending", "resting", "executed", "canceled", "rejected"]
    assert _ts_enum_values("kalshiOrderStatusEnum", "kalshi_order_status") == expected
    assert list(kalshi_order_status_enum.enums) == expected


def test_kalshi_signal_decision_enum_values() -> None:
    expected = ["emitted", "skipped", "dry_run", "blocked"]
    assert (
        _ts_enum_values("kalshiSignalDecisionEnum", "kalshi_signal_decision")
        == expected
    )
    assert list(kalshi_signal_decision_enum.enums) == expected


def test_kalshi_account_status_enum_values() -> None:
    expected = ["local_only", "active", "failed"]
    assert (
        _ts_enum_values("kalshiAccountStatusEnum", "kalshi_account_status")
        == expected
    )
    assert list(kalshi_account_status_enum.enums) == expected


def test_sqlite_create_all_succeeds() -> None:
    engine = make_test_engine()
    inspector_tables = set(engine.dialect.get_table_names(engine.connect()))
    for name in (
        "kalshi_account",
        "kalshi_market",
        "kalshi_signal",
        "kalshi_order",
        "kalshi_position",
        "kalshi_fill",
        "kalshi_bot_state",
    ):
        assert name in inspector_tables, f"missing table {name}"


def test_kalshi_account_unique_user_id() -> None:
    engine = make_test_engine()
    session = make_session_factory(engine)()

    seed_user(session, "alice")
    primary = seed_account(session, "alice", type_="kalshi")
    secondary = seed_account(session, "alice", type_="kalshi", name="Brokerage 2")

    session.add(
        KalshiAccount(trading_account_id=primary.id, user_id="alice")
    )
    session.commit()

    session.add(
        KalshiAccount(trading_account_id=secondary.id, user_id="alice")
    )
    with pytest.raises(IntegrityError):
        session.commit()


def test_kalshi_account_subaccount_constraint() -> None:
    # SQLite does not enforce CHECK constraints by default, so verifying the
    # model registers the constraint object is the strongest portable check.
    constraint_names = {
        c.name for c in KalshiAccount.__table__.constraints if c.name
    }
    assert "kalshi_account_subaccount_number_range_check" in constraint_names

    columns = {col.name for col in KalshiAccount.__table__.columns}
    assert "subaccount_number" in columns


def test_kalshi_order_unique_client_order_id() -> None:
    engine = make_test_engine()
    session = make_session_factory(engine)()

    seed_user(session, "alice")
    account = seed_account(session, "alice", type_="kalshi")
    session.add(
        KalshiOrder(
            trading_account_id=account.id,
            client_order_id="dup-client-id",
            market_ticker="KXBTCD-TEST",
            side="yes",
            action="buy",
            order_type="limit",
            count_fp=Decimal("1"),
            status="pending",
            strategy="threshold_drift",
        )
    )
    session.commit()

    session.add(
        KalshiOrder(
            trading_account_id=account.id,
            client_order_id="dup-client-id",
            market_ticker="KXBTCD-TEST",
            side="yes",
            action="buy",
            order_type="limit",
            count_fp=Decimal("1"),
            status="pending",
            strategy="threshold_drift",
        )
    )
    with pytest.raises(IntegrityError):
        session.commit()


def test_kalshi_order_signal_id_fk() -> None:
    fk_targets = {
        next(iter(col.foreign_keys)).target_fullname
        for col in KalshiOrder.__table__.columns
        if col.name == "signal_id" and col.foreign_keys
    }
    assert fk_targets == {"kalshi_signal.id"}

    signal_id_col = KalshiOrder.__table__.c.signal_id
    assert signal_id_col.nullable is True

    # Round-trip with a real signal row to confirm the FK is wired and the
    # link round-trips through the session.
    engine = make_test_engine()
    session = make_session_factory(engine)()
    seed_user(session, "alice")
    account = seed_account(session, "alice", type_="kalshi")

    signal = KalshiSignal(
        trading_account_id=account.id,
        strategy="threshold_drift",
        decision="emitted",
        created_at=datetime.now(timezone.utc),
    )
    session.add(signal)
    session.commit()

    order = KalshiOrder(
        trading_account_id=account.id,
        client_order_id="cli-1",
        market_ticker="KXBTCD-TEST",
        side="yes",
        action="buy",
        order_type="limit",
        count_fp=Decimal("1"),
        status="pending",
        strategy="threshold_drift",
        signal_id=signal.id,
    )
    session.add(order)
    session.commit()
    assert order.signal_id == signal.id


def test_models_exported_from_app_db() -> None:
    from app.db import (  # noqa: F401
        KalshiAccount,
        KalshiBotState,
        KalshiFill,
        KalshiMarket,
        KalshiOrder,
        KalshiPosition,
        KalshiSignal,
    )
