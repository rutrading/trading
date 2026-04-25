import json
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.db.models import Strategy, Symbol
from app.routers import strategies as strategies_router
from app.routers.strategies import (
    BacktestRequest,
    CreateStrategyRequest,
    StrategyControlRequest,
    _stream_strategy_snapshots,
    backtest_strategy,
    create_strategy,
    strategy_controls,
)
from app.schemas import StrategyResponse, StrategyRunResponse
from app.services.strategy_engine import BacktestTrade


class _Account:
    def __init__(self, account_id: int, account_type: str) -> None:
        self.id = account_id
        self.type = account_type


def _make_symbol(ticker: str = "AAPL", asset_class: str = "us_equity") -> Symbol:
    symbol = Symbol()
    symbol.ticker = ticker
    symbol.asset_class = asset_class
    return symbol


def _make_db(
    symbol: Symbol | None, existing_strategy: Strategy | None = None
) -> MagicMock:
    db = MagicMock()

    def query_side_effect(model):
        query = MagicMock()
        if model is Symbol:
            query.filter.return_value.first.return_value = symbol
        elif model is Strategy:
            query.filter.return_value.first.return_value = existing_strategy
        return query

    db.query.side_effect = query_side_effect

    def refresh_side_effect(obj):
        if getattr(obj, "id", None) is None:
            obj.id = 123
        now = datetime.now(timezone.utc)
        if getattr(obj, "created_at", None) is None:
            obj.created_at = now
        if getattr(obj, "updated_at", None) is None:
            obj.updated_at = now

    db.refresh.side_effect = refresh_side_effect
    return db


def _payload(**overrides) -> CreateStrategyRequest:
    data = {
        "trading_account_id": 1,
        "name": "EMA 9/21 AAPL",
        "strategy_type": "ema_crossover",
        "ticker": "AAPL",
        "timeframe": "1Day",
        "status": "active",
        "params_json": {
            "fast_period": 9,
            "slow_period": 21,
            "order_quantity": "2",
        },
        "risk_json": {
            "max_position_quantity": "20",
            "max_daily_orders": 3,
            "cooldown_minutes": 15,
            "max_daily_notional": "10000",
        },
    }
    data.update(overrides)
    return CreateStrategyRequest(**data)


def test_create_strategy_success(monkeypatch):
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    response = create_strategy(_payload(), user={"sub": "dev"}, db=db)

    assert response.id == 123
    assert response.trading_account_id == 1
    assert response.ticker == "AAPL"
    assert response.strategy_type == "ema_crossover"
    assert response.status == "active"

    added = db.add.call_args[0][0]
    assert isinstance(added, Strategy)
    assert added.params_json["fast_period"] == 9
    assert added.params_json["slow_period"] == 21
    assert added.params_json["order_quantity"] == "2"
    db.commit.assert_called_once()
    db.refresh.assert_called_once()


def test_create_strategy_rejects_duplicate(monkeypatch):
    existing = Strategy()
    existing.id = 99
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=existing)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    with pytest.raises(HTTPException, match="already exists"):
        create_strategy(_payload(), user={"sub": "dev"}, db=db)

    db.add.assert_not_called()


def test_create_strategy_rejects_non_investment_account(monkeypatch):
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "crypto"),
    )

    with pytest.raises(HTTPException, match="limited to investment accounts"):
        create_strategy(_payload(), user={"sub": "dev"}, db=db)


def test_create_strategy_requires_existing_symbol(monkeypatch):
    db = _make_db(symbol=None, existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    with pytest.raises(HTTPException, match="not found"):
        create_strategy(_payload(ticker="NOPE"), user={"sub": "dev"}, db=db)


def test_create_strategy_validates_ema_params(monkeypatch):
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    with pytest.raises(
        HTTPException, match="fast_period must be less than slow_period"
    ):
        create_strategy(
            _payload(params_json={"fast_period": 20, "slow_period": 10}),
            user={"sub": "dev"},
            db=db,
        )


def test_create_strategy_validates_rsi_thresholds(monkeypatch):
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    with pytest.raises(HTTPException, match="RSI thresholds"):
        create_strategy(
            _payload(
                strategy_type="rsi_reversion",
                name="RSI Reversion",
                params_json={
                    "rsi_period": 14,
                    "oversold_threshold": 70,
                    "overbought_threshold": 30,
                    "order_quantity": "1",
                },
            ),
            user={"sub": "dev"},
            db=db,
        )


def test_create_strategy_normalizes_symbols_and_risk(monkeypatch):
    db = _make_db(symbol=None, existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )
    monkeypatch.setattr(
        strategies_router,
        "_load_symbols",
        lambda db, tickers: [_make_symbol(ticker) for ticker in tickers],
    )

    response = create_strategy(
        _payload(
            ticker="msft",
            symbols_json=["AAPL", "msft", "AAPL"],
            capital_allocation="25000.50",
            risk_json={
                "max_position_quantity": "25",
                "max_daily_orders": 2,
                "cooldown_minutes": 5,
                "max_daily_notional": "5000",
                "allow_pyramiding": True,
            },
        ),
        user={"sub": "dev"},
        db=db,
    )

    added = db.add.call_args[0][0]
    assert added.ticker == "MSFT"
    assert added.symbols_json == ["MSFT", "AAPL"]
    assert added.capital_allocation == Decimal("25000.50")
    assert added.risk_json == {
        "max_position_quantity": "25",
        "max_daily_orders": 2,
        "cooldown_minutes": 5,
        "max_daily_notional": "5000",
        "risk_per_trade": "0",
        "atr_period": 14,
        "atr_stop_multiplier": "2",
        "allow_pyramiding": True,
    }
    assert response.symbols_json == ["MSFT", "AAPL"]
    assert response.capital_allocation == "25000.50"


def test_create_strategy_enforces_active_limit(monkeypatch):
    db = _make_db(symbol=_make_symbol("AAPL"), existing_strategy=None)
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )
    monkeypatch.setattr(
        strategies_router,
        "_active_strategy_count",
        lambda _query_result: strategies_router.MAX_ACTIVE_STRATEGIES_PER_ACCOUNT,
    )

    with pytest.raises(HTTPException, match="Active strategy limit reached"):
        create_strategy(_payload(), user={"sub": "dev"}, db=db)


def test_strategy_controls_updates_all_matching_strategies(monkeypatch):
    strategy_a = Strategy(status="active")
    strategy_a.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    strategy_b = Strategy(status="disabled")
    strategy_b.updated_at = datetime(2026, 1, 1, tzinfo=timezone.utc)

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [strategy_a, strategy_b]
    monkeypatch.setattr(
        strategies_router,
        "get_trading_account",
        lambda trading_account_id, user, db: _Account(trading_account_id, "investment"),
    )

    response = strategy_controls(
        StrategyControlRequest(trading_account_id=1, action="pause_all"),
        user={"sub": "dev"},
        db=db,
    )

    assert response == {"updated": 2, "status": "paused"}
    assert strategy_a.status == "paused"
    assert strategy_b.status == "paused"
    assert strategy_a.updated_at > datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert strategy_b.updated_at > datetime(2026, 1, 1, tzinfo=timezone.utc)
    db.commit.assert_called_once()


def test_backtest_strategy_normalizes_symbols_and_serializes_trades(monkeypatch):
    db = MagicMock()
    monkeypatch.setattr(
        strategies_router,
        "_load_symbols",
        lambda db, tickers: [_make_symbol(ticker) for ticker in tickers],
    )

    captured: dict = {}

    def fake_run_backtest(**kwargs):
        captured.update(kwargs)
        return {
            "equity_curve": [
                {"time": 1, "equity": Decimal("10012.34"), "drawdown": Decimal("0")}
            ],
            "drawdown_curve": [
                {"time": 1, "equity": Decimal("10012.34"), "drawdown": Decimal("0")}
            ],
            "trades": [
                BacktestTrade(
                    ticker="MSFT",
                    side="buy",
                    quantity=Decimal("1"),
                    price=Decimal("250.5"),
                    timestamp=datetime(2026, 1, 5, tzinfo=timezone.utc),
                    profit=Decimal("12.34"),
                )
            ],
            "win_rate": 1.0,
            "avg_return_per_trade": 0.12,
            "max_drawdown": -0.03,
            "ending_equity": "10012.34",
        }

    monkeypatch.setattr(strategies_router, "run_backtest", fake_run_backtest)

    response = backtest_strategy(
        BacktestRequest(
            ticker="msft",
            symbols_json=["AAPL", "msft"],
            timeframe="1Day",
            capital_allocation="10000",
            params_json={
                "fast_period": 2,
                "slow_period": 4,
                "order_quantity": "1",
            },
            risk_json={
                "max_position_quantity": "5",
                "max_daily_orders": 2,
                "cooldown_minutes": 0,
                "max_daily_notional": "5000",
            },
            start="2026-01-01T00:00:00Z",
            end="2026-01-31T00:00:00Z",
        ),
        user={"sub": "dev"},
        db=db,
    )

    assert captured["symbols"] == ["MSFT", "AAPL"]
    assert captured["capital_allocation"] == Decimal("10000")
    assert captured["params_json"] == {
        "fast_period": 2,
        "slow_period": 4,
        "order_quantity": "1",
    }
    assert captured["risk_json"] == {
        "max_position_quantity": "5",
        "max_daily_orders": 2,
        "cooldown_minutes": 0,
        "max_daily_notional": "5000",
        "risk_per_trade": "0",
        "atr_period": 14,
        "atr_stop_multiplier": "2",
        "allow_pyramiding": False,
    }
    assert response.trades[0].ticker == "MSFT"
    assert response.trades[0].profit == "12.34"
    assert response.ending_equity == "10012.34"


def test_strategy_catalog_exposes_dynamic_form_fields():
    response = strategies_router.strategy_catalog(user={"sub": "dev"})

    template_ids = {template.id for template in response.templates}
    assert template_ids == {
        "ema_crossover",
        "sma_crossover",
        "rsi_reversion",
        "donchian_breakout",
    }

    rsi_template = next(template for template in response.templates if template.id == "rsi_reversion")
    assert {field["key"] for field in rsi_template.params_schema_json} == {
        "rsi_period",
        "oversold_threshold",
        "overbought_threshold",
        "order_quantity",
    }
    assert {field["key"] for field in rsi_template.risk_schema_json} >= {
        "risk_per_trade",
        "atr_period",
        "atr_stop_multiplier",
    }


class _DummySession:
    def close(self):
        return None


async def test_stream_strategy_snapshots_serializes_response_models(monkeypatch):
    monkeypatch.setattr(
        strategies_router,
        "get_session_factory",
        lambda: _DummySession,
    )
    monkeypatch.setattr(
        strategies_router,
        "_snapshot_payload",
        lambda db, trading_account_id: {
            "trading_account_id": trading_account_id,
            "strategies": [
                StrategyResponse(
                    id=1,
                    trading_account_id=trading_account_id,
                    name="EMA 2/4 MSFT",
                    strategy_type="ema_crossover",
                    ticker="MSFT",
                    symbols_json=["MSFT", "AAPL"],
                    timeframe="1Day",
                    capital_allocation="10000",
                    params_json={"fast_period": 2, "slow_period": 4},
                    risk_json={"max_daily_notional": "5000"},
                    status="active",
                    last_run_at=None,
                    last_signal_at=None,
                    last_error=None,
                    created_at="2026-01-01T00:00:00+00:00",
                    updated_at="2026-01-01T00:00:00+00:00",
                )
            ],
            "runs": [
                StrategyRunResponse(
                    id=1,
                    strategy_id=1,
                    trading_account_id=trading_account_id,
                    ticker="MSFT",
                    run_at="2026-01-02T00:00:00+00:00",
                    signal="buy",
                    action="place_buy",
                    reason="ema_cross",
                    inputs_json={"bar_count": 10},
                    order_id=None,
                    error=None,
                )
            ],
            "open_orders": [],
            "open_positions": [],
            "strategy_executor_enabled": True,
        },
    )

    stream = _stream_strategy_snapshots(7)
    chunk = await anext(stream)
    await stream.aclose()

    assert chunk.startswith("event: snapshot\ndata: ")
    payload = chunk.removeprefix("event: snapshot\ndata: ").strip()
    body = json.loads(payload)
    assert body["trading_account_id"] == 7
    assert body["strategies"][0]["symbols_json"] == ["MSFT", "AAPL"]
    assert body["runs"][0]["action"] == "place_buy"
