"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";
import type { Quote } from "@/lib/quote";

export type WatchlistItem = {
  ticker: string;
  created_at: string;
  quote: Quote | null;
};

type WatchlistResponse = { watchlist: WatchlistItem[] };
type MutateResponse = { ticker: string; added?: boolean; removed?: boolean };

export async function getWatchlist(): Promise<api.ApiResult<WatchlistResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<WatchlistResponse>("/watchlist");
}

export async function addToWatchlist(ticker: string): Promise<api.ApiResult<MutateResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.post<MutateResponse>("/watchlist", { query: { ticker } });
}

export async function removeFromWatchlist(ticker: string): Promise<api.ApiResult<MutateResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.del<MutateResponse>("/watchlist", { ticker });
}
