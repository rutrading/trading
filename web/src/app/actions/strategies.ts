"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type StrategyType =
  | "ema_crossover"
  | "sma_crossover"
  | "rsi_reversion"
  | "donchian_breakout";

export type StrategyFieldDefinition = {
  key: string;
  label: string;
  kind: "integer" | "decimal" | "boolean";
  description?: string | null;
  min?: string | null;
  max?: string | null;
  step?: string | null;
};

export type Strategy = {
  id: number;
  trading_account_id: number;
  name: string;
  strategy_type: StrategyType;
  ticker: string;
  symbols_json: string[];
  timeframe: "1Day";
  capital_allocation: string;
  params_json: Record<string, unknown>;
  risk_json: Record<string, unknown>;
  status: "active" | "paused" | "disabled";
  last_run_at: string | null;
  last_signal_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type StrategyRun = {
  id: number;
  strategy_id: number;
  trading_account_id: number;
  ticker: string;
  run_at: string;
  signal: "buy" | "sell" | "hold";
  action: "place_buy" | "place_sell" | "none";
  reason: string;
  inputs_json: Record<string, unknown>;
  order_id: number | null;
  error: string | null;
};

type StrategyListResponse = { strategies: Strategy[] };
type StrategyRunsResponse = {
  runs: StrategyRun[];
  total: number;
  page: number;
  per_page: number;
};

export type StrategyTemplate = {
  id: StrategyType;
  name: string;
  description: string;
  supported_timeframes: string[];
  default_params_json: Record<string, unknown>;
  default_risk_json: Record<string, unknown>;
  params_schema_json: StrategyFieldDefinition[];
  risk_schema_json: StrategyFieldDefinition[];
  status: string;
};

export type StrategyBacktestTrade = {
  ticker: string;
  side: string;
  quantity: string;
  price: string;
  timestamp: string;
  profit: string | null;
};

export type StrategyBacktestPoint = {
  time: number;
  equity: string;
  drawdown: string;
};

export type StrategyBacktestResult = {
  equity_curve: StrategyBacktestPoint[];
  drawdown_curve: StrategyBacktestPoint[];
  trades: StrategyBacktestTrade[];
  win_rate: number;
  avg_return_per_trade: number;
  max_drawdown: number;
  ending_equity: string;
};

export type StrategySnapshot = {
  trading_account_id: number;
  strategies: Strategy[];
  runs: StrategyRun[];
  open_orders: Array<Record<string, unknown>>;
  open_positions: Array<Record<string, unknown>>;
  strategy_executor_enabled: boolean;
};

export async function getStrategies(
  tradingAccountId: number,
): Promise<api.ApiResult<StrategyListResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<StrategyListResponse>("/strategies", {
    trading_account_id: tradingAccountId.toString(),
  });
}

export async function createStrategy(payload: {
  trading_account_id: number;
  name: string;
  ticker: string;
  symbols_json?: string[];
  timeframe: "1Day";
  strategy_type?: StrategyType;
  status?: "active" | "paused" | "disabled";
  capital_allocation?: string;
  params_json: Record<string, unknown>;
  risk_json?: Record<string, unknown>;
}): Promise<api.ApiResult<Strategy>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.postJson<Strategy>("/strategies", payload);
}

export async function patchStrategy(
  strategyId: number,
  payload: {
    name?: string;
    ticker?: string;
    symbols_json?: string[];
    status?: "active" | "paused" | "disabled";
    timeframe?: "1Day";
    capital_allocation?: string;
    params_json?: Record<string, unknown>;
    risk_json?: Record<string, unknown>;
  },
): Promise<api.ApiResult<Strategy>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.patchJson<Strategy>(`/strategies/${strategyId}`, payload);
}

export async function deleteStrategy(strategyId: number): Promise<api.ApiResult<{ deleted: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.del<{ deleted: boolean }>(`/strategies/${strategyId}`);
}

export async function runStrategy(strategyId: number): Promise<api.ApiResult<{ ok: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.post<{ ok: boolean }>(`/strategies/${strategyId}/run`);
}

export async function getStrategyRuns(
  tradingAccountId: number,
  strategyId?: number,
): Promise<api.ApiResult<StrategyRunsResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<StrategyRunsResponse>("/strategy-runs", {
    trading_account_id: tradingAccountId.toString(),
    strategy_id: strategyId?.toString(),
    page: "1",
    per_page: "50",
  });
}

export async function getStrategyCatalog(): Promise<api.ApiResult<{ templates: StrategyTemplate[] }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<{ templates: StrategyTemplate[] }>("/strategy-catalog");
}

export async function getStrategySnapshot(
  tradingAccountId: number,
): Promise<api.ApiResult<StrategySnapshot>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<StrategySnapshot>("/strategy-snapshot", {
    trading_account_id: tradingAccountId.toString(),
  });
}

export async function runStrategyBacktest(payload: {
  strategy_type: StrategyType;
  ticker: string;
  symbols_json?: string[];
  timeframe: "1Day";
  capital_allocation: string;
  params_json: Record<string, unknown>;
  risk_json?: Record<string, unknown>;
  start: string;
  end: string;
}): Promise<api.ApiResult<StrategyBacktestResult>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.postJson<StrategyBacktestResult>("/strategies/backtest", payload);
}

export async function controlStrategies(payload: {
  trading_account_id: number;
  action: "pause_all" | "resume_all" | "disable_all";
}): Promise<api.ApiResult<{ updated: number; status: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.postJson<{ updated: number; status: string }>("/strategy-controls", payload);
}
