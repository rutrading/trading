"use server";

import { get, type ApiResult } from "@/lib/api";

export type KalshiStatusStub = { account: { trading_account_id: number } };

export async function getKalshiStatus(): Promise<ApiResult<KalshiStatusStub>> {
  return get<KalshiStatusStub>("/kalshi/status");
}
