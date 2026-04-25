from __future__ import annotations

from pydantic import BaseModel

from app.db.models import Strategy, StrategyRun


class StrategyResponse(BaseModel):
    id: int
    trading_account_id: int
    name: str
    strategy_type: str
    ticker: str
    symbols_json: list[str]
    timeframe: str
    capital_allocation: str
    params_json: dict
    risk_json: dict
    status: str
    last_run_at: str | None
    last_signal_at: str | None
    last_error: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_strategy(cls, strategy: Strategy) -> "StrategyResponse":
        return cls(
            id=strategy.id,
            trading_account_id=strategy.trading_account_id,
            name=strategy.name,
            strategy_type=strategy.strategy_type,
            ticker=strategy.ticker,
            symbols_json=list(strategy.symbols_json or []),
            timeframe=strategy.timeframe,
            capital_allocation=str(strategy.capital_allocation),
            params_json=strategy.params_json or {},
            risk_json=strategy.risk_json or {},
            status=strategy.status,
            last_run_at=strategy.last_run_at.isoformat()
            if strategy.last_run_at
            else None,
            last_signal_at=strategy.last_signal_at.isoformat()
            if strategy.last_signal_at
            else None,
            last_error=strategy.last_error,
            created_at=strategy.created_at.isoformat(),
            updated_at=strategy.updated_at.isoformat(),
        )


class StrategyListResponse(BaseModel):
    strategies: list[StrategyResponse]


class StrategyRunResponse(BaseModel):
    id: int
    strategy_id: int
    trading_account_id: int
    ticker: str
    run_at: str
    signal: str
    action: str
    reason: str
    inputs_json: dict
    order_id: int | None
    error: str | None

    @classmethod
    def from_run(cls, run: StrategyRun) -> "StrategyRunResponse":
        return cls(
            id=run.id,
            strategy_id=run.strategy_id,
            trading_account_id=run.trading_account_id,
            ticker=run.ticker,
            run_at=run.run_at.isoformat(),
            signal=run.signal,
            action=run.action,
            reason=run.reason,
            inputs_json=run.inputs_json or {},
            order_id=run.order_id,
            error=run.error,
        )


class StrategyRunsPageResponse(BaseModel):
    runs: list[StrategyRunResponse]
    total: int
    page: int
    per_page: int


class StrategyTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    supported_timeframes: list[str]
    default_params_json: dict
    default_risk_json: dict
    params_schema_json: list[dict]
    risk_schema_json: list[dict]
    status: str


class StrategyCatalogResponse(BaseModel):
    templates: list[StrategyTemplateResponse]


class StrategyBacktestTradeResponse(BaseModel):
    ticker: str
    side: str
    quantity: str
    price: str
    timestamp: str
    profit: str | None = None


class StrategyBacktestPointResponse(BaseModel):
    time: int
    equity: str
    drawdown: str


class StrategyBacktestResponse(BaseModel):
    equity_curve: list[StrategyBacktestPointResponse]
    drawdown_curve: list[StrategyBacktestPointResponse]
    trades: list[StrategyBacktestTradeResponse]
    win_rate: float
    avg_return_per_trade: float
    max_drawdown: float
    ending_equity: str


class StrategySnapshotResponse(BaseModel):
    trading_account_id: int
    strategies: list[StrategyResponse]
    runs: list[StrategyRunResponse]
    open_orders: list[dict]
    open_positions: list[dict]
    strategy_executor_enabled: bool
