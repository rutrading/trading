"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type QuoteSnapshot = {
  ticker: string;
  price: number | null;
  bid_price: number | null;
  ask_price: number | null;
  change: number | null;
  change_percent: number | null;
  previous_close: number | null;
  timestamp: number;
};

export async function getQuote(
  ticker: string,
): Promise<api.ApiResult<QuoteSnapshot>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<QuoteSnapshot>("/quote", { ticker });
}
