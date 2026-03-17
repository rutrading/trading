"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type HistoricalBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  trade_count: number;
};

type BarsResponse = {
  ticker: string;
  timeframe: string;
  source: string;
  bars: HistoricalBar[];
};

export async function getHistoricalBars(params: {
  ticker: string;
  timeframe: string;
  start: string;
  end?: string;
}): Promise<api.ApiResult<BarsResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };

  return api.get<BarsResponse>("/historical-bars", params);
}
