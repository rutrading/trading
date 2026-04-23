from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.db.models import Strategy, Symbol
from app.routers import strategies as strategies_router
from app.routers.strategies import CreateStrategyRequest, create_strategy


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
            "max_position_quantity": "20",
            "max_daily_orders": 3,
            "cooldown_minutes": 15,
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
