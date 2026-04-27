"""Kalshi automated trading bot loop.

Per-cycle shape mirrors `order_executor.py`: synchronous DB work runs
inside `asyncio.to_thread` so the event loop stays free for HTTP awaits.
Wiring into the FastAPI lifespan happens in branch 06; this module only
exposes the loop and helpers.

Cross-cutting decisions repeated here so a future reader does not have to
walk the brief: signals (emitted / skipped / dry_run / blocked) always go
to `kalshi_signal`; `kalshi_order` only mirrors real external attempts.
Idempotency is via app-generated `client_order_id` — the local pending
row is committed before the HTTP call so a crash mid-place still leaves a
trace the startup sweep can reconcile.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func

from app.config import Config, get_config
from app.db.models import (
    KalshiAccount,
    KalshiBotState,
    KalshiFill,
    KalshiMarket,
    KalshiOrder,
    KalshiPosition,
)
from app.db.session import get_session_factory
from app.services import kalshi_rest
from app.services.alpaca_rest import fetch_snapshot
from app.services.bars import fetch_intraday_bars, parse_iso_utc
from app.strategies.kalshi import get_strategy
from app.strategies.kalshi.base import MarketSnapshot, OrderIntent
from app.strategies.kalshi.signals import write_signal

logger = logging.getLogger(__name__)

_MIN_SECONDS_TO_CLOSE = 120
_MAX_SPREAD_DOLLARS = Decimal("0.10")
_MAX_ENTRY_DOLLARS = Decimal("0.80")
_MIN_TOP_BOOK_SIZE = Decimal("1.00")
_BTC_HISTORY_LOOKBACK_MINUTES = 60
_STARTUP_SWEEP_AGE_MINUTES = 5
_BTC_TICKER = "BTC/USD"


@dataclass(frozen=True)
class _AccountCtx:
    trading_account_id: int
    subaccount_number: int | None
    status: str
    active_strategy: str
    automation_enabled: bool
    paused: bool
    dry_run: bool
    max_orders_per_cycle: int
    max_open_contracts: int


# ---------------------------------------------------------------------------
# Top-level loop
# ---------------------------------------------------------------------------


async def run_kalshi_bot() -> None:
    config = get_config()
    session_factory = get_session_factory()

    await asyncio.to_thread(_startup_sweep, session_factory)
    logger.info(
        "Kalshi bot started (poll=%ds)", config.kalshi_poll_interval_seconds
    )

    while True:
        try:
            await _run_one_cycle(config, session_factory)
        except Exception:
            logger.exception("Kalshi bot cycle failed")
        await asyncio.sleep(config.kalshi_poll_interval_seconds)


# ---------------------------------------------------------------------------
# One cycle
# ---------------------------------------------------------------------------


async def _run_one_cycle(config: Config, session_factory) -> None:
    accounts = await asyncio.to_thread(_load_enabled_accounts, session_factory)
    if not accounts:
        return

    btc_quote = await fetch_snapshot(_BTC_TICKER)
    if btc_quote.price is None:
        return
    btc_price = Decimal(str(btc_quote.price))

    now = datetime.now(timezone.utc)
    history = await _load_btc_history(now)

    markets = await kalshi_rest.list_btc_hourly_markets(limit=200)
    tickers = [m["ticker"] for m in markets if m.get("status") == "open"]
    if not tickers:
        return

    orderbooks = await kalshi_rest.get_orderbooks(tickers)
    await asyncio.to_thread(_upsert_markets, session_factory, markets)

    for account_ctx in accounts:
        try:
            await _evaluate_account(
                config,
                session_factory,
                account_ctx,
                markets,
                orderbooks,
                btc_price,
                history,
                now,
            )
        except Exception:
            logger.exception(
                "Kalshi cycle error for account=%s",
                account_ctx.trading_account_id,
            )
            await asyncio.to_thread(
                _record_account_error,
                session_factory,
                account_ctx.trading_account_id,
                "cycle_error",
            )


async def _load_btc_history(now: datetime) -> list[Decimal]:
    start = (now - timedelta(minutes=_BTC_HISTORY_LOOKBACK_MINUTES)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    end = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    bars = await fetch_intraday_bars(_BTC_TICKER, "1Min", start, end)
    return [Decimal(str(b["close"])) for b in bars]


# ---------------------------------------------------------------------------
# Per-account evaluation
# ---------------------------------------------------------------------------


async def _evaluate_account(
    config: Config,
    session_factory,
    account_ctx: _AccountCtx,
    markets: list[dict],
    orderbooks: dict[str, dict],
    btc_price: Decimal,
    history: list[Decimal],
    now: datetime,
) -> None:
    if not account_ctx.automation_enabled:
        return
    if account_ctx.paused:
        return

    try:
        strategy = get_strategy(account_ctx.active_strategy)
    except KeyError:
        await asyncio.to_thread(
            _write_signal_blocking,
            session_factory,
            account_ctx.trading_account_id,
            account_ctx.active_strategy,
            decision="blocked",
            reason="unknown_strategy",
        )
        return

    candidates = sorted(
        [m for m in markets if m.get("status") == "open"],
        key=lambda m: m.get("close_time") or "",
    )[: account_ctx.max_orders_per_cycle]

    orders_placed = 0
    for market in candidates:
        if orders_placed >= account_ctx.max_orders_per_cycle:
            break

        ticker = market["ticker"]
        snapshot = _build_snapshot(market, orderbooks.get(ticker), now)
        if snapshot is None:
            continue

        seconds_to_close = (snapshot.close_time - now).total_seconds()
        if seconds_to_close < _MIN_SECONDS_TO_CLOSE:
            continue

        spread = _max_spread(snapshot)
        if spread is not None and spread > _MAX_SPREAD_DOLLARS:
            await asyncio.to_thread(
                _write_signal_blocking,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                decision="skipped",
                reason="wide_spread",
                market_ticker=ticker,
            )
            continue

        intent = strategy.evaluate(snapshot, btc_price, history, now)
        if intent is None:
            continue

        if account_ctx.dry_run:
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "dry_run",
                intent,
                None,
            )
            continue

        if account_ctx.subaccount_number is None:
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "blocked",
                intent,
                "no_subaccount",
            )
            continue

        existing = await asyncio.to_thread(
            _existing_contract_count,
            session_factory,
            account_ctx.trading_account_id,
        )
        if existing + intent.count_fp > Decimal(account_ctx.max_open_contracts):
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "blocked",
                intent,
                "max_open_contracts",
            )
            continue

        is_dup = await asyncio.to_thread(
            _has_open_order,
            session_factory,
            account_ctx.trading_account_id,
            intent.market_ticker,
            intent.side,
        )
        if is_dup:
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "blocked",
                intent,
                "duplicate_open_order",
            )
            continue

        if intent.limit_price_dollars > _MAX_ENTRY_DOLLARS:
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "blocked",
                intent,
                "entry_too_high",
            )
            continue

        top_size = _top_book_size_for_side(snapshot, intent.side)
        if top_size is None or top_size < _MIN_TOP_BOOK_SIZE:
            await asyncio.to_thread(
                _write_signal_with_intent,
                session_factory,
                account_ctx.trading_account_id,
                strategy.name,
                "blocked",
                intent,
                "thin_book",
            )
            continue

        client_order_id = str(uuid.uuid4())
        order_id = await asyncio.to_thread(
            _record_pending_order,
            session_factory,
            account_ctx,
            strategy.name,
            intent,
            client_order_id,
            config.kalshi_order_time_in_force,
        )

        try:
            response = await kalshi_rest.place_order(
                client_order_id=client_order_id,
                ticker=intent.market_ticker,
                side=intent.side,
                action=intent.action,
                count_fp=intent.count_fp,
                limit_price_dollars=intent.limit_price_dollars,
                time_in_force=config.kalshi_order_time_in_force,
                subaccount_number=account_ctx.subaccount_number,
            )
        except Exception as exc:
            await asyncio.to_thread(
                _mark_order_rejected, session_factory, order_id, str(exc)
            )
            continue

        await asyncio.to_thread(
            _update_order_from_response, session_factory, order_id, response
        )
        orders_placed += 1

    if account_ctx.subaccount_number is not None:
        await _reconcile_account(session_factory, account_ctx)

    await asyncio.to_thread(
        _record_cycle_success,
        session_factory,
        account_ctx.trading_account_id,
    )


async def _reconcile_account(session_factory, account_ctx: _AccountCtx) -> None:
    sub = account_ctx.subaccount_number
    assert sub is not None  # caller guards

    try:
        remote_orders = await kalshi_rest.get_orders(subaccount_number=sub)
        await asyncio.to_thread(
            _upsert_remote_orders, session_factory, account_ctx, remote_orders
        )
    except Exception:
        logger.exception(
            "Kalshi get_orders reconciliation failed for account=%s",
            account_ctx.trading_account_id,
        )

    try:
        positions = await kalshi_rest.get_positions(subaccount_number=sub)
        await asyncio.to_thread(
            _upsert_positions, session_factory, account_ctx, positions
        )
    except Exception:
        logger.exception(
            "Kalshi get_positions reconciliation failed for account=%s",
            account_ctx.trading_account_id,
        )

    try:
        fills = await kalshi_rest.get_fills(subaccount_number=sub)
        await asyncio.to_thread(
            _upsert_fills, session_factory, account_ctx, fills
        )
    except Exception:
        logger.exception(
            "Kalshi get_fills reconciliation failed for account=%s",
            account_ctx.trading_account_id,
        )

    try:
        balances = await kalshi_rest.get_subaccount_balances()
        await asyncio.to_thread(
            _update_balance, session_factory, account_ctx, balances
        )
    except Exception:
        logger.exception(
            "Kalshi balances reconciliation failed for account=%s",
            account_ctx.trading_account_id,
        )


# ---------------------------------------------------------------------------
# Snapshot construction (orderbook normalisation)
# ---------------------------------------------------------------------------


def _build_snapshot(
    market: dict, orderbook: dict | None, now: datetime
) -> MarketSnapshot | None:
    if orderbook is None:
        return None
    fp = orderbook.get("orderbook_fp") or {}
    yes_levels = fp.get("yes_dollars") or []
    no_levels = fp.get("no_dollars") or []

    best_yes_bid = _dec_or_none(yes_levels[0][0]) if yes_levels else None
    best_no_bid = _dec_or_none(no_levels[0][0]) if no_levels else None
    yes_ask = (Decimal("1") - best_no_bid) if best_no_bid is not None else None
    no_ask = (Decimal("1") - best_yes_bid) if best_yes_bid is not None else None
    yes_size = _dec_or_none(yes_levels[0][1]) if yes_levels else None
    no_size = _dec_or_none(no_levels[0][1]) if no_levels else None

    raw_close = market.get("close_time")
    if not raw_close:
        return None
    close_time = parse_iso_utc(raw_close) if isinstance(raw_close, str) else raw_close

    return MarketSnapshot(
        ticker=market["ticker"],
        floor_strike=_dec_or_none(market.get("floor_strike")),
        cap_strike=_dec_or_none(market.get("cap_strike")),
        yes_bid_dollars=best_yes_bid,
        yes_ask_dollars=yes_ask,
        no_bid_dollars=best_no_bid,
        no_ask_dollars=no_ask,
        yes_bid_size_fp=yes_size,
        no_bid_size_fp=no_size,
        close_time=close_time,
        price_level_structure=market.get("price_level_structure"),
        fractional_trading_enabled=bool(
            market.get("fractional_trading_enabled", False)
        ),
    )


def _max_spread(snapshot: MarketSnapshot) -> Decimal | None:
    spreads: list[Decimal] = []
    if snapshot.yes_bid_dollars is not None and snapshot.yes_ask_dollars is not None:
        spreads.append(snapshot.yes_ask_dollars - snapshot.yes_bid_dollars)
    if snapshot.no_bid_dollars is not None and snapshot.no_ask_dollars is not None:
        spreads.append(snapshot.no_ask_dollars - snapshot.no_bid_dollars)
    return max(spreads) if spreads else None


def _top_book_size_for_side(snapshot: MarketSnapshot, side: str) -> Decimal | None:
    # YES ask depth comes from NO bid liquidity (and vice versa) since each
    # contract pair sums to $1 — a YES buy fills against the resting NO bids.
    if side == "yes":
        return snapshot.no_bid_size_fp
    return snapshot.yes_bid_size_fp


def _dec_or_none(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


# ---------------------------------------------------------------------------
# Sync DB helpers (run inside asyncio.to_thread)
# ---------------------------------------------------------------------------


def _load_enabled_accounts(session_factory) -> list[_AccountCtx]:
    with session_factory() as db:
        rows = (
            db.query(KalshiAccount, KalshiBotState)
            .join(
                KalshiBotState,
                KalshiBotState.trading_account_id == KalshiAccount.trading_account_id,
            )
            .all()
        )
        return [
            _AccountCtx(
                trading_account_id=ka.trading_account_id,
                subaccount_number=ka.subaccount_number,
                status=ka.status,
                active_strategy=bs.active_strategy,
                automation_enabled=bool(bs.automation_enabled),
                paused=bool(bs.paused),
                dry_run=bool(bs.dry_run),
                max_orders_per_cycle=bs.max_orders_per_cycle,
                max_open_contracts=bs.max_open_contracts,
            )
            for ka, bs in rows
        ]


def _upsert_markets(session_factory, markets: list[dict]) -> None:
    if not markets:
        return
    with session_factory() as db:
        for m in markets:
            ticker = m.get("ticker")
            if not ticker:
                continue
            existing = (
                db.query(KalshiMarket).filter(KalshiMarket.ticker == ticker).first()
            )
            close_time = (
                parse_iso_utc(m["close_time"]) if m.get("close_time") else None
            )
            open_time = (
                parse_iso_utc(m["open_time"]) if m.get("open_time") else None
            )
            data: dict[str, Any] = {
                "series_ticker": m.get("series_ticker") or "KXBTCD",
                "event_ticker": m.get("event_ticker"),
                "title": m.get("title"),
                "yes_sub_title": m.get("yes_sub_title"),
                "no_sub_title": m.get("no_sub_title"),
                "strike_type": m.get("strike_type"),
                "floor_strike": _dec_or_none(m.get("floor_strike")),
                "cap_strike": _dec_or_none(m.get("cap_strike")),
                "open_time": open_time,
                "close_time": close_time,
                "status": m.get("status"),
                "price_level_structure": m.get("price_level_structure"),
                "fractional_trading_enabled": bool(
                    m.get("fractional_trading_enabled", False)
                ),
                "last_seen_at": datetime.now(timezone.utc),
            }
            if existing is None:
                db.add(KalshiMarket(ticker=ticker, **data))
            else:
                for k, v in data.items():
                    setattr(existing, k, v)
        db.commit()


def _existing_contract_count(session_factory, trading_account_id: int) -> Decimal:
    with session_factory() as db:
        open_sum = (
            db.query(func.coalesce(func.sum(KalshiOrder.count_fp), 0))
            .filter(
                KalshiOrder.trading_account_id == trading_account_id,
                KalshiOrder.status.in_(["pending", "resting"]),
            )
            .scalar()
        )
        positions = (
            db.query(KalshiPosition.position_fp)
            .filter(KalshiPosition.trading_account_id == trading_account_id)
            .all()
        )
        pos_total = sum(
            (abs(p.position_fp) for p in positions if p.position_fp is not None),
            Decimal("0"),
        )
        return Decimal(str(open_sum or 0)) + pos_total


def _has_open_order(
    session_factory, trading_account_id: int, market_ticker: str, side: str
) -> bool:
    with session_factory() as db:
        return (
            db.query(KalshiOrder.id)
            .filter(
                KalshiOrder.trading_account_id == trading_account_id,
                KalshiOrder.market_ticker == market_ticker,
                KalshiOrder.side == side,
                KalshiOrder.status.in_(["pending", "resting"]),
            )
            .first()
            is not None
        )


def _write_signal_blocking(
    session_factory,
    trading_account_id: int,
    strategy: str,
    *,
    decision: str,
    reason: str | None = None,
    market_ticker: str | None = None,
) -> None:
    with session_factory() as db:
        write_signal(
            db,
            trading_account_id=trading_account_id,
            strategy=strategy,
            decision=decision,
            market_ticker=market_ticker,
            reason=reason,
        )
        db.commit()


def _write_signal_with_intent(
    session_factory,
    trading_account_id: int,
    strategy: str,
    decision: str,
    intent: OrderIntent,
    reason: str | None,
) -> None:
    with session_factory() as db:
        write_signal(
            db,
            trading_account_id=trading_account_id,
            strategy=strategy,
            decision=decision,
            intent=intent,
            reason=reason,
        )
        db.commit()


def _record_pending_order(
    session_factory,
    account_ctx: _AccountCtx,
    strategy_name: str,
    intent: OrderIntent,
    client_order_id: str,
    time_in_force: str,
) -> int:
    with session_factory() as db:
        signal = write_signal(
            db,
            trading_account_id=account_ctx.trading_account_id,
            strategy=strategy_name,
            decision="emitted",
            intent=intent,
        )
        order = KalshiOrder(
            trading_account_id=account_ctx.trading_account_id,
            subaccount_number=account_ctx.subaccount_number,
            client_order_id=client_order_id,
            market_ticker=intent.market_ticker,
            side=intent.side,
            action=intent.action,
            order_type="limit",
            time_in_force=time_in_force,
            count_fp=intent.count_fp,
            limit_price_dollars=intent.limit_price_dollars,
            status="pending",
            strategy=strategy_name,
            signal_id=signal.id,
        )
        db.add(order)
        db.flush()
        order_id = order.id
        db.commit()
        return order_id


def _update_order_from_response(
    session_factory, order_id: int, response: dict
) -> None:
    payload = response.get("order") if isinstance(response, dict) else None
    if not isinstance(payload, dict):
        payload = response if isinstance(response, dict) else {}
    with session_factory() as db:
        order: KalshiOrder | None = (
            db.query(KalshiOrder).filter(KalshiOrder.id == order_id).first()
        )
        if order is None:
            return
        kalshi_order_id = payload.get("order_id") or payload.get("id")
        if kalshi_order_id is not None:
            order.kalshi_order_id = str(kalshi_order_id)
        status = payload.get("status")
        if status:
            order.status = status
        order.raw_response = response
        if "fill_count_fp" in payload and payload["fill_count_fp"] is not None:
            order.fill_count_fp = Decimal(str(payload["fill_count_fp"]))
        if (
            "remaining_count_fp" in payload
            and payload["remaining_count_fp"] is not None
        ):
            order.remaining_count_fp = Decimal(str(payload["remaining_count_fp"]))
        db.commit()


def _mark_order_rejected(
    session_factory, order_id: int, reason: str
) -> None:
    with session_factory() as db:
        order: KalshiOrder | None = (
            db.query(KalshiOrder).filter(KalshiOrder.id == order_id).first()
        )
        if order is None:
            return
        order.status = "rejected"
        order.rejection_reason = reason
        db.commit()


def _upsert_remote_orders(
    session_factory, account_ctx: _AccountCtx, remote_orders: list[dict]
) -> None:
    if not remote_orders:
        return
    with session_factory() as db:
        for ro in remote_orders:
            kalshi_order_id = ro.get("order_id") or ro.get("id")
            if not kalshi_order_id:
                continue
            existing: KalshiOrder | None = (
                db.query(KalshiOrder)
                .filter(KalshiOrder.kalshi_order_id == str(kalshi_order_id))
                .first()
            )
            status = ro.get("status") or "pending"
            fill_count = ro.get("fill_count_fp")
            remaining = ro.get("remaining_count_fp")
            if existing is None:
                client_id = ro.get("client_order_id") or f"remote-{kalshi_order_id}"
                db.add(
                    KalshiOrder(
                        trading_account_id=account_ctx.trading_account_id,
                        subaccount_number=account_ctx.subaccount_number,
                        kalshi_order_id=str(kalshi_order_id),
                        client_order_id=client_id,
                        market_ticker=ro.get("ticker") or "",
                        side=ro.get("side") or "yes",
                        action=ro.get("action") or "buy",
                        order_type=ro.get("type") or "limit",
                        time_in_force=ro.get("time_in_force") or "immediate_or_cancel",
                        count_fp=Decimal(str(ro.get("count_fp", "0"))),
                        limit_price_dollars=_dec_or_none(
                            ro.get("yes_price_dollars")
                            or ro.get("no_price_dollars")
                        ),
                        status=status,
                        strategy="external",
                        fill_count_fp=Decimal(str(fill_count or 0)),
                        remaining_count_fp=_dec_or_none(remaining),
                        raw_response=ro,
                    )
                )
            else:
                existing.status = status
                existing.raw_response = ro
                if fill_count is not None:
                    existing.fill_count_fp = Decimal(str(fill_count))
                if remaining is not None:
                    existing.remaining_count_fp = Decimal(str(remaining))
        db.commit()


def _upsert_positions(
    session_factory, account_ctx: _AccountCtx, positions: list[dict]
) -> None:
    if not positions:
        return
    with session_factory() as db:
        for p in positions:
            ticker = p.get("ticker") or p.get("market_ticker")
            if not ticker:
                continue
            existing: KalshiPosition | None = (
                db.query(KalshiPosition)
                .filter(
                    KalshiPosition.trading_account_id == account_ctx.trading_account_id,
                    KalshiPosition.market_ticker == ticker,
                )
                .first()
            )
            position_fp = Decimal(str(p.get("position", "0")))
            if existing is None:
                db.add(
                    KalshiPosition(
                        trading_account_id=account_ctx.trading_account_id,
                        subaccount_number=account_ctx.subaccount_number,
                        market_ticker=ticker,
                        position_fp=position_fp,
                        raw_response=p,
                    )
                )
            else:
                existing.position_fp = position_fp
                existing.subaccount_number = account_ctx.subaccount_number
                existing.raw_response = p
        db.commit()


def _upsert_fills(
    session_factory, account_ctx: _AccountCtx, fills: list[dict]
) -> None:
    if not fills:
        return
    with session_factory() as db:
        for f in fills:
            fill_id = (
                f.get("trade_id") or f.get("fill_id") or f.get("id")
            )
            if not fill_id:
                continue
            fill_id = str(fill_id)
            existing: KalshiFill | None = (
                db.query(KalshiFill)
                .filter(KalshiFill.kalshi_fill_id == fill_id)
                .first()
            )
            executed_raw = f.get("created_time") or f.get("executed_time")
            executed_at = (
                parse_iso_utc(executed_raw)
                if isinstance(executed_raw, str) and executed_raw
                else datetime.now(timezone.utc)
            )
            payload = {
                "kalshi_trade_id": f.get("trade_id"),
                "kalshi_order_id": f.get("order_id"),
                "side": f.get("side") or "yes",
                "action": f.get("action") or "buy",
                "count_fp": Decimal(str(f.get("count", "0"))),
                "yes_price_dollars": _dec_or_none(f.get("yes_price")),
                "no_price_dollars": _dec_or_none(f.get("no_price")),
                "executed_at": executed_at,
                "raw_response": f,
            }
            if existing is None:
                db.add(
                    KalshiFill(
                        trading_account_id=account_ctx.trading_account_id,
                        subaccount_number=account_ctx.subaccount_number,
                        kalshi_fill_id=fill_id,
                        market_ticker=f.get("ticker") or "",
                        **payload,
                    )
                )
        db.commit()


def _update_balance(
    session_factory, account_ctx: _AccountCtx, balances: list[dict]
) -> None:
    if not balances:
        return
    target = None
    for b in balances:
        if b.get("subaccount_number") == account_ctx.subaccount_number:
            target = b
            break
    if target is None:
        return
    raw_balance = target.get("balance")
    if raw_balance is None:
        return
    with session_factory() as db:
        ka: KalshiAccount | None = (
            db.query(KalshiAccount)
            .filter(KalshiAccount.trading_account_id == account_ctx.trading_account_id)
            .first()
        )
        if ka is None:
            return
        ka.last_balance_dollars = Decimal(str(raw_balance))
        db.commit()


def _record_cycle_success(session_factory, trading_account_id: int) -> None:
    with session_factory() as db:
        state: KalshiBotState | None = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == trading_account_id)
            .first()
        )
        if state is None:
            return
        state.last_cycle_at = datetime.now(timezone.utc)
        state.last_error = None
        db.commit()


def _record_account_error(
    session_factory, trading_account_id: int, reason: str
) -> None:
    with session_factory() as db:
        state: KalshiBotState | None = (
            db.query(KalshiBotState)
            .filter(KalshiBotState.trading_account_id == trading_account_id)
            .first()
        )
        if state is None:
            return
        state.last_error = reason
        db.commit()


# ---------------------------------------------------------------------------
# Startup sweep
# ---------------------------------------------------------------------------


def _startup_sweep(session_factory) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(
        minutes=_STARTUP_SWEEP_AGE_MINUTES
    )
    with session_factory() as db:
        rows = (
            db.query(KalshiOrder)
            .filter(KalshiOrder.status == "pending")
            .filter(KalshiOrder.created_at < cutoff)
            .all()
        )
        for row in rows:
            row.status = "rejected"
            row.rejection_reason = "startup_sweep_phantom_pending"
        db.commit()
        if rows:
            logger.warning(
                "Kalshi startup sweep marked %d phantom pending orders as rejected",
                len(rows),
            )


__all__ = [
    "run_kalshi_bot",
    "_run_one_cycle",
    "_evaluate_account",
    "_startup_sweep",
    "_build_snapshot",
]
