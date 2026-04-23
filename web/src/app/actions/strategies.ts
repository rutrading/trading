"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type Strategy = {
  id: number;
  trading_account_id: number;
  name: string;
  strategy_type: "ema_crossover";
  ticker: string;
  timeframe: "1Day";
  params_json: Record<string, unknown>;
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
  timeframe: "1Day";
  strategy_type?: "ema_crossover";
  status?: "active" | "paused" | "disabled";
  params_json: {
    fast_period: number;
    slow_period: number;
    order_quantity: string;
    max_position_quantity: string;
    max_daily_orders: number;
    cooldown_minutes: number;
  };
}): Promise<api.ApiResult<Strategy>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.postJson<Strategy>("/strategies", payload);
}

export async function patchStrategy(
  strategyId: number,
  payload: {
    name?: string;
    status?: "active" | "paused" | "disabled";
    timeframe?: "1Day";
    params_json?: {
      fast_period: number;
      slow_period: number;
      order_quantity: string;
      max_position_quantity: string;
      max_daily_orders: number;
      cooldown_minutes: number;
    };
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
