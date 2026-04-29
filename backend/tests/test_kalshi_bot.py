"""Tests for the Kalshi bot loop.

The infinite top-level loop is not exercised directly. Tests drive
``_run_one_cycle`` and ``_evaluate_account`` through ``asyncio.run`` with
the REST surface and the Alpaca snapshot/bars helpers monkeypatched onto
the bot module. The DB layer is the real SQLAlchemy stack against the
shared SQLite test engine, so the gate / signal / order writes go through
the same ORM the production loop uses.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import asyncio

from app.db.models import (
    KalshiAccount,
    KalshiBotState,
    KalshiFill,
    KalshiOrder,
    KalshiPosition,
    KalshiSignal,
)
from app.services import kalshi_rest
from app.strategies.kalshi.base import OrderIntent
from app.tasks import kalshi_bot
from tests.integration_helpers import (
    make_session_factory,
    make_test_engine,
    seed_account,
    seed_user,
)


# ---------------------------------------------------------------------------
# Seed / fake helpers
# ---------------------------------------------------------------------------


_DEFAULT_TIF = "immediate_or_cancel"


def _config(**overrides):
    base = SimpleNamespace(
        kalshi_order_time_in_force=_DEFAULT_TIF,
        kalshi_poll_interval_seconds=30,
    )
    for k, v in overrides.items():
        setattr(base, k, v)
    return base


def _make_db():
    engine = make_test_engine()
    factory = make_session_factory(engine)
    return engine, factory


def _seed_kalshi_account(
    db,
    *,
    user_id="u1",
    subaccount_number=None,
    status="active",
):
    account = seed_account(db, user_id, type_="kalshi", name="kalshi-acct")
    db.add(
        KalshiAccount(
            trading_account_id=account.id,
            user_id=user_id,
            subaccount_number=subaccount_number,
            status=status,
        )
    )
    db.commit()
    return account


def _seed_bot_state(
    db,
    trading_account_id,
    *,
    active_strategy="threshold_drift",
    automation_enabled=True,
    paused=False,
    dry_run=False,
    max_orders_per_cycle=1,
    max_open_contracts=5,
):
    state = KalshiBotState(
        trading_account_id=trading_account_id,
        active_strategy=active_strategy,
        automation_enabled=automation_enabled,
        paused=paused,
        dry_run=dry_run,
        max_orders_per_cycle=max_orders_per_cycle,
        max_open_contracts=max_open_contracts,
    )
    db.add(state)
    db.commit()
    return state


def _now_utc():
    return datetime.now(timezone.utc)


def _market_dict(
    ticker="KXBTCD-T1",
    *,
    close_time=None,
    floor="100000",
    cap="110000",
    status="open",
):
    if close_time is None:
        close_time = (_now_utc() + timedelta(hours=2)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    return {
        "ticker": ticker,
        "series_ticker": "KXBTCD",
        "floor_strike": floor,
        "cap_strike": cap,
        "close_time": close_time,
        "status": status,
    }


def _orderbook(
    ticker,
    *,
    yes_bid="0.40",
    yes_size="10.00",
    no_bid="0.55",
    no_size="10.00",
):
    levels: dict[str, list] = {}
    if yes_bid is not None:
        levels["yes_dollars"] = [[yes_bid, yes_size]]
    if no_bid is not None:
        levels["no_dollars"] = [[no_bid, no_size]]
    return {"ticker": ticker, "orderbook_fp": levels}


class _FakeStrategy:
    def __init__(self, intent=None, name="fake"):
        self.name = name
        self._intent = intent

    def evaluate(self, market, btc_price, history, now):
        return self._intent


def _intent_for(
    ticker="KXBTCD-T1",
    side="yes",
    limit="0.40",
    count="1.00",
):
    return OrderIntent(
        market_ticker=ticker,
        side=side,
        action="buy",
        count_fp=Decimal(count),
        limit_price_dollars=Decimal(limit),
        rationale={"strategy": "fake", "edge": "0.10"},
    )


def _patch_alpaca(monkeypatch, *, btc_price=100_500.0, bars_count=60):
    quote = SimpleNamespace(price=btc_price)
    fetch_mock = AsyncMock(return_value=quote)
    monkeypatch.setattr(kalshi_bot, "fetch_snapshot", fetch_mock)
    bars = [{"close": float(btc_price - i * 5)} for i in range(bars_count)]
    monkeypatch.setattr(
        kalshi_bot, "fetch_intraday_bars", AsyncMock(return_value=bars)
    )
    return fetch_mock


def _patch_kalshi_rest(
    monkeypatch,
    *,
    markets=None,
    orderbooks=None,
    place_response=None,
    place_exc=None,
    orders=None,
    positions=None,
    fills=None,
    balances=None,
):
    if markets is None:
        markets = []
    if orderbooks is None:
        orderbooks = {}
    list_mock = AsyncMock(return_value=markets)
    monkeypatch.setattr(kalshi_rest, "list_btc_hourly_markets", list_mock)
    monkeypatch.setattr(
        kalshi_rest, "get_orderbooks", AsyncMock(return_value=orderbooks)
    )

    place_mock = AsyncMock(return_value=place_response or {})
    if place_exc is not None:
        place_mock.side_effect = place_exc
    monkeypatch.setattr(kalshi_rest, "place_order", place_mock)

    monkeypatch.setattr(
        kalshi_rest, "get_orders", AsyncMock(return_value=orders or [])
    )
    monkeypatch.setattr(
        kalshi_rest, "get_positions", AsyncMock(return_value=positions or [])
    )
    monkeypatch.setattr(
        kalshi_rest, "get_fills", AsyncMock(return_value=fills or [])
    )
    monkeypatch.setattr(
        kalshi_rest,
        "get_subaccount_balances",
        AsyncMock(return_value=balances or []),
    )

    return SimpleNamespace(list=list_mock, place=place_mock)


def _stub_strategy(monkeypatch, intent):
    """Return a fake _FakeStrategy and patch get_strategy to return it."""
    fake = _FakeStrategy(intent=intent, name="threshold_drift")
    monkeypatch.setattr(kalshi_bot, "get_strategy", lambda name: fake)
    return fake


def _run_cycle(factory, config=None):
    asyncio.run(kalshi_bot._run_one_cycle(config or _config(), factory))


# ---------------------------------------------------------------------------
# Cycle-level skips
# ---------------------------------------------------------------------------


def test_zero_accounts_cycle_is_noop(monkeypatch):
    _, factory = _make_db()
    fetch = _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(monkeypatch)

    _run_cycle(factory)

    assert fetch.await_count == 0
    assert rest.list.await_count == 0
    assert rest.place.await_count == 0


def test_cycle_skips_automation_disabled_account(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, automation_enabled=False)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch, markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )

    _run_cycle(factory)

    with factory() as db:
        assert db.query(KalshiSignal).count() == 0
        assert db.query(KalshiOrder).count() == 0
    assert rest.place.await_count == 0


def test_cycle_skips_paused_account(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, paused=True)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch, markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )

    _run_cycle(factory)

    with factory() as db:
        assert db.query(KalshiSignal).count() == 0
    assert rest.place.await_count == 0


# ---------------------------------------------------------------------------
# Strategy gating
# ---------------------------------------------------------------------------


def test_unknown_strategy_blocks(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, active_strategy="nope")

    _patch_alpaca(monkeypatch)
    _patch_kalshi_rest(
        monkeypatch, markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "blocked"
        assert sig.reason == "unknown_strategy"
        assert sig.strategy == "nope"


def test_strategy_returning_none_writes_no_signal(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    _patch_kalshi_rest(
        monkeypatch, markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=None)

    _run_cycle(factory)

    with factory() as db:
        assert db.query(KalshiSignal).count() == 0
        assert db.query(KalshiOrder).count() == 0


# ---------------------------------------------------------------------------
# Pre-strategy gates
# ---------------------------------------------------------------------------


def test_wide_spread_skipped(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={
            "KXBTCD-T1": _orderbook(
                "KXBTCD-T1", yes_bid="0.30", no_bid="0.45"
            )
        },
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "skipped"
        assert sig.reason == "wide_spread"
        assert db.query(KalshiOrder).count() == 0


# ---------------------------------------------------------------------------
# Post-strategy gates
# ---------------------------------------------------------------------------


def test_dry_run_writes_signal_no_order(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, dry_run=True)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "dry_run"
        assert sig.side == "yes"
        assert sig.count_fp == Decimal("1.00")
        assert db.query(KalshiOrder).count() == 0
    assert rest.place.await_count == 0


def test_active_status_markets_are_processed(monkeypatch):
    # Demo Kalshi returns markets with `status="active"` for currently-tradeable
    # rows; the historic test fixtures used `"open"`. The bot must accept both
    # (the upstream `status=open` query filter is the source of truth, not the
    # response field), otherwise live cycles silently no-op.
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, dry_run=True)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1", status="active")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "dry_run"
        state = db.query(KalshiBotState).one()
        assert state.last_cycle_at is not None
    assert rest.place.await_count == 0


def test_no_subaccount_blocks_with_reason(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=None)
        _seed_bot_state(db, account.id, dry_run=False)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "blocked"
        assert sig.reason == "no_subaccount"
        assert db.query(KalshiOrder).count() == 0
    assert rest.place.await_count == 0


def test_max_open_contracts_blocks(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, max_open_contracts=5)
        # Seed an open order for 3 contracts and a position for 2 — sum = 5 = cap.
        # Adding a 1-contract intent would push to 6 > 5 → blocked.
        from app.db.models import KalshiMarket as _KM

        db.add(
            _KM(
                ticker="KXBTCD-OTHER",
                series_ticker="KXBTCD",
                close_time=_now_utc() + timedelta(hours=2),
                status="open",
            )
        )
        db.commit()
        db.add(
            KalshiOrder(
                trading_account_id=account.id,
                subaccount_number=5,
                client_order_id="seed-1",
                market_ticker="KXBTCD-OTHER",
                side="yes",
                action="buy",
                order_type="limit",
                count_fp=Decimal("3.00"),
                limit_price_dollars=Decimal("0.40"),
                status="resting",
                strategy="fake",
            )
        )
        db.add(
            KalshiPosition(
                trading_account_id=account.id,
                subaccount_number=5,
                market_ticker="KXBTCD-OTHER",
                position_fp=Decimal("2.00"),
            )
        )
        db.commit()

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    with factory() as db:
        signals = (
            db.query(KalshiSignal)
            .filter(KalshiSignal.market_ticker == "KXBTCD-T1")
            .all()
        )
        assert len(signals) == 1
        assert signals[0].decision == "blocked"
        assert signals[0].reason == "max_open_contracts"
    assert rest.place.await_count == 0


def test_duplicate_open_order_blocks(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)
        from app.db.models import KalshiMarket as _KM

        db.add(
            _KM(
                ticker="KXBTCD-T1",
                series_ticker="KXBTCD",
                close_time=_now_utc() + timedelta(hours=2),
                status="open",
            )
        )
        db.commit()
        db.add(
            KalshiOrder(
                trading_account_id=account.id,
                subaccount_number=5,
                client_order_id="seed-1",
                market_ticker="KXBTCD-T1",
                side="yes",
                action="buy",
                order_type="limit",
                count_fp=Decimal("1.00"),
                limit_price_dollars=Decimal("0.40"),
                status="resting",
                strategy="fake",
            )
        )
        db.commit()

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
    )
    _stub_strategy(monkeypatch, intent=_intent_for(ticker="KXBTCD-T1", side="yes"))

    _run_cycle(factory)

    with factory() as db:
        sig = (
            db.query(KalshiSignal)
            .filter(KalshiSignal.decision == "blocked")
            .one()
        )
        assert sig.reason == "duplicate_open_order"
    assert rest.place.await_count == 0


def test_entry_too_high_blocked(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    # Intent's limit price 0.85 trips the entry-too-high gate. yes_bid=0.85,
    # no_bid=0.10 → yes_ask=0.90, spread=0.05 — passes the wide-spread gate
    # so we reach the entry-price gate.
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={
            "KXBTCD-T1": _orderbook(
                "KXBTCD-T1", yes_bid="0.85", no_bid="0.10"
            )
        },
    )
    _stub_strategy(monkeypatch, intent=_intent_for(limit="0.85"))

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "blocked"
        assert sig.reason == "entry_too_high"
    assert rest.place.await_count == 0


def test_thin_book_blocked(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={
            "KXBTCD-T1": _orderbook(
                "KXBTCD-T1",
                yes_bid="0.40",
                yes_size="10.00",
                no_bid="0.55",
                no_size="0.50",
            )
        },
    )
    _stub_strategy(monkeypatch, intent=_intent_for(side="yes"))

    _run_cycle(factory)

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "blocked"
        assert sig.reason == "thin_book"
    assert rest.place.await_count == 0


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------


def test_active_subaccount_places_order(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        place_response={
            "order": {
                "order_id": "kx-1",
                "status": "resting",
                "fill_count_fp": "0",
                "remaining_count_fp": "1.00",
            }
        },
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    assert rest.place.await_count == 1
    kwargs = rest.place.await_args.kwargs
    assert kwargs["subaccount_number"] == 5
    assert kwargs["ticker"] == "KXBTCD-T1"

    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "emitted"
        order = db.query(KalshiOrder).one()
        assert order.kalshi_order_id == "kx-1"
        assert order.status == "resting"
        assert order.signal_id == sig.id
        assert order.client_order_id == kwargs["client_order_id"]


def test_max_orders_per_cycle_enforced(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id, max_orders_per_cycle=1)

    _patch_alpaca(monkeypatch)
    markets = [_market_dict("KXBTCD-A"), _market_dict("KXBTCD-B")]
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=markets,
        orderbooks={
            "KXBTCD-A": _orderbook("KXBTCD-A"),
            "KXBTCD-B": _orderbook("KXBTCD-B"),
        },
        place_response={"order": {"order_id": "kx-1", "status": "resting"}},
    )

    # The fake strategy emits intent for whichever ticker it sees first; the
    # ticker on the intent must match the market the bot evaluated, but the
    # cap should fire after the first place_order.
    class _AlwaysEmit:
        name = "fake"

        def evaluate(self, market, btc_price, history, now):
            return _intent_for(ticker=market.ticker)

    monkeypatch.setattr(kalshi_bot, "get_strategy", lambda name: _AlwaysEmit())

    _run_cycle(factory)

    assert rest.place.await_count == 1
    with factory() as db:
        assert db.query(KalshiOrder).count() == 1


def test_place_order_http_failure_marks_order_rejected(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    rest = _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        place_exc=kalshi_rest.KalshiRequestFailed("boom"),
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    assert rest.place.await_count == 1
    with factory() as db:
        sig = db.query(KalshiSignal).one()
        assert sig.decision == "emitted"
        order = db.query(KalshiOrder).one()
        assert order.status == "rejected"
        assert order.rejection_reason and "boom" in order.rejection_reason


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------


def test_reconciliation_upserts_orders_idempotently(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    monkeypatch.setattr(kalshi_bot, "get_strategy", lambda name: _FakeStrategy(intent=None))

    remote_orders_v1 = [
        {
            "order_id": "kx-rec-1",
            "ticker": "KXBTCD-T1",
            "side": "yes",
            "action": "buy",
            "type": "limit",
            "status": "resting",
            "count_fp": "1.00",
            "yes_price_dollars": "0.40",
        }
    ]
    remote_orders_v2 = [{**remote_orders_v1[0], "status": "executed"}]

    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        orders=remote_orders_v1,
    )
    _run_cycle(factory)

    with factory() as db:
        rows = db.query(KalshiOrder).all()
        assert len(rows) == 1
        assert rows[0].status == "resting"

    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        orders=remote_orders_v2,
    )
    _run_cycle(factory)

    with factory() as db:
        rows = db.query(KalshiOrder).all()
        assert len(rows) == 1
        assert rows[0].status == "executed"


def test_reconciliation_upserts_fills_idempotently(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)

    _patch_alpaca(monkeypatch)
    monkeypatch.setattr(kalshi_bot, "get_strategy", lambda name: _FakeStrategy(intent=None))

    fill_payload = {
        "trade_id": "fill-1",
        "ticker": "KXBTCD-T1",
        "side": "yes",
        "action": "buy",
        "count": "1.00",
        "yes_price": "0.40",
        "created_time": (_now_utc()).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        fills=[fill_payload],
    )
    _run_cycle(factory)
    _run_cycle(factory)

    with factory() as db:
        rows = db.query(KalshiFill).all()
        assert len(rows) == 1
        assert rows[0].kalshi_fill_id == "fill-1"


# ---------------------------------------------------------------------------
# Startup sweep
# ---------------------------------------------------------------------------


def test_startup_sweep_marks_phantom_pending_rejected():
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        from app.db.models import KalshiMarket as _KM

        db.add(
            _KM(
                ticker="KXBTCD-T1",
                series_ticker="KXBTCD",
                close_time=_now_utc() + timedelta(hours=2),
                status="open",
            )
        )
        db.commit()
        old = KalshiOrder(
            trading_account_id=account.id,
            subaccount_number=5,
            client_order_id="cid-stale",
            market_ticker="KXBTCD-T1",
            side="yes",
            action="buy",
            order_type="limit",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.40"),
            status="pending",
            strategy="fake",
            created_at=_now_utc() - timedelta(minutes=10),
        )
        db.add(old)
        db.commit()
        old_id = old.id

    kalshi_bot._startup_sweep(factory)

    with factory() as db:
        row = db.query(KalshiOrder).filter(KalshiOrder.id == old_id).one()
        assert row.status == "rejected"
        assert row.rejection_reason == "startup_sweep_phantom_pending"


def test_startup_sweep_leaves_recent_pending_alone():
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        from app.db.models import KalshiMarket as _KM

        db.add(
            _KM(
                ticker="KXBTCD-T1",
                series_ticker="KXBTCD",
                close_time=_now_utc() + timedelta(hours=2),
                status="open",
            )
        )
        db.commit()
        recent = KalshiOrder(
            trading_account_id=account.id,
            subaccount_number=5,
            client_order_id="cid-recent",
            market_ticker="KXBTCD-T1",
            side="yes",
            action="buy",
            order_type="limit",
            count_fp=Decimal("1.00"),
            limit_price_dollars=Decimal("0.40"),
            status="pending",
            strategy="fake",
            created_at=_now_utc() - timedelta(minutes=1),
        )
        db.add(recent)
        db.commit()
        recent_id = recent.id

    kalshi_bot._startup_sweep(factory)

    with factory() as db:
        row = db.query(KalshiOrder).filter(KalshiOrder.id == recent_id).one()
        assert row.status == "pending"


# ---------------------------------------------------------------------------
# Per-account error isolation + heartbeat
# ---------------------------------------------------------------------------


def test_cycle_continues_after_one_account_errors(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        seed_user(db, "u2")
        bad_account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        good_account = _seed_kalshi_account(db, user_id="u2", subaccount_number=6)
        _seed_bot_state(db, bad_account.id)
        _seed_bot_state(db, good_account.id)
        bad_id = bad_account.id
        good_id = good_account.id

    _patch_alpaca(monkeypatch)
    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        place_response={"order": {"order_id": "kx-good", "status": "resting"}},
    )

    real_evaluate = kalshi_bot._evaluate_account
    seen: list[int] = []

    async def evaluating(*args, **kwargs):
        account_ctx = args[2]
        seen.append(account_ctx.trading_account_id)
        if account_ctx.trading_account_id == bad_id:
            raise RuntimeError("account-failed")
        return await real_evaluate(*args, **kwargs)

    monkeypatch.setattr(kalshi_bot, "_evaluate_account", evaluating)
    _stub_strategy(monkeypatch, intent=_intent_for())

    _run_cycle(factory)

    assert bad_id in seen and good_id in seen
    with factory() as db:
        bad_state = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == bad_id)
            .one()
        )
        assert bad_state.last_error == "cycle_error"
        good_state = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == good_id)
            .one()
        )
        assert good_state.last_cycle_at is not None
        # The good account still wrote a signal + order.
        good_sig = (
            db.query(KalshiSignal)
            .filter(KalshiSignal.trading_account_id == good_id)
            .one()
        )
        assert good_sig.decision == "emitted"


def test_last_cycle_at_updated(monkeypatch):
    _, factory = _make_db()
    with factory() as db:
        seed_user(db, "u1")
        account = _seed_kalshi_account(db, user_id="u1", subaccount_number=5)
        _seed_bot_state(db, account.id)
        # Pre-set last_error so we can assert it gets cleared.
        state = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == account.id)
            .one()
        )
        state.last_error = "stale"
        db.commit()
        account_id = account.id

    _patch_alpaca(monkeypatch)
    _patch_kalshi_rest(
        monkeypatch,
        markets=[_market_dict("KXBTCD-T1")],
        orderbooks={"KXBTCD-T1": _orderbook("KXBTCD-T1")},
        place_response={"order": {"order_id": "kx-1", "status": "resting"}},
    )
    _stub_strategy(monkeypatch, intent=_intent_for())

    before = _now_utc().replace(tzinfo=None)
    _run_cycle(factory)

    with factory() as db:
        state = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == account_id)
            .one()
        )
        assert state.last_cycle_at is not None
        # SQLite drops tzinfo on read; compare naive-to-naive.
        observed = state.last_cycle_at
        if observed.tzinfo is not None:
            observed = observed.replace(tzinfo=None)
        assert observed >= before
        assert state.last_error is None
