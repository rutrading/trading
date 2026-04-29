"use server";

import { get, post, postJson, type ApiResult } from "@/lib/api";

export type KalshiAccountStatus = "local_only" | "active" | "failed";
export type KalshiSide = "yes" | "no";
export type KalshiAction = "buy" | "sell";
export type KalshiOrderStatus =
  | "pending"
  | "resting"
  | "executed"
  | "canceled"
  | "rejected";
export type KalshiSignalDecision = "emitted" | "skipped" | "dry_run" | "blocked";

export type KalshiAccountInfo = {
  trading_account_id: number;
  subaccount_number: number | null;
  status: KalshiAccountStatus;
  provisioning_error: string | null;
  last_balance_dollars: string | null;
};

export type KalshiBotStateInfo = {
  active_strategy: string;
  automation_enabled: boolean;
  paused: boolean;
  dry_run: boolean;
  max_orders_per_cycle: number;
  max_open_contracts: number;
  last_cycle_at: string | null;
  last_error: string | null;
};

export type KalshiStatus = {
  account: KalshiAccountInfo;
  bot_state: KalshiBotStateInfo;
};

export type KalshiSignal = {
  id: number;
  market_ticker: string | null;
  strategy: string;
  side: KalshiSide | null;
  action: KalshiAction | null;
  count_fp: string | null;
  limit_price_dollars: string | null;
  decision: KalshiSignalDecision;
  reason: string | null;
  snapshot: Record<string, unknown> | null;
  created_at: string;
};

export type KalshiOrder = {
  id: number;
  market_ticker: string;
  side: KalshiSide;
  action: KalshiAction;
  count_fp: string;
  limit_price_dollars: string | null;
  status: KalshiOrderStatus;
  fill_count_fp: string;
  remaining_count_fp: string | null;
  rejection_reason: string | null;
  subaccount_number: number | null;
  kalshi_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type KalshiPosition = {
  market_ticker: string;
  position_fp: string;
  total_traded_dollars: string;
  market_exposure_dollars: string;
  realized_pnl_dollars: string;
  fees_paid_dollars: string;
  updated_at: string;
};

export type KalshiFill = {
  id: number;
  market_ticker: string;
  side: KalshiSide;
  action: KalshiAction;
  count_fp: string;
  yes_price_dollars: string | null;
  no_price_dollars: string | null;
  fee_dollars: string;
  is_taker: boolean | null;
  kalshi_order_id: string | null;
  executed_at: string;
};

export type ActionResult = { success: true } | { success: false; error: string };

const limitParams = (limit?: number) =>
  limit !== undefined ? { limit: String(limit) } : undefined;

function toActionResult<T>(res: ApiResult<T>): ActionResult {
  return res.ok ? { success: true } : { success: false, error: res.error };
}

export async function getKalshiStatus(): Promise<ApiResult<KalshiStatus>> {
  return get<KalshiStatus>("/kalshi/status");
}

export async function getKalshiSignals(
  opts?: { limit?: number },
): Promise<ApiResult<KalshiSignal[]>> {
  return get<KalshiSignal[]>("/kalshi/signals", limitParams(opts?.limit));
}

export async function getKalshiOrders(
  opts?: { limit?: number },
): Promise<ApiResult<KalshiOrder[]>> {
  return get<KalshiOrder[]>("/kalshi/orders", limitParams(opts?.limit));
}

export async function getKalshiPositions(): Promise<
  ApiResult<KalshiPosition[]>
> {
  return get<KalshiPosition[]>("/kalshi/positions");
}

export async function getKalshiFills(
  opts?: { limit?: number },
): Promise<ApiResult<KalshiFill[]>> {
  return get<KalshiFill[]>("/kalshi/fills", limitParams(opts?.limit));
}

export async function provisionSubaccount(): Promise<ActionResult> {
  return toActionResult(await post<KalshiAccountInfo>("/kalshi/provision-subaccount"));
}

export async function setBotControl(payload: {
  automation_enabled?: boolean;
  paused?: boolean;
  dry_run?: boolean;
}): Promise<ActionResult> {
  return toActionResult(
    await postJson<KalshiBotStateInfo>("/kalshi/control", payload),
  );
}

export async function setBotStrategy(strategy: string): Promise<ActionResult> {
  return toActionResult(
    await postJson<KalshiBotStateInfo>("/kalshi/strategy", { strategy }),
  );
}
