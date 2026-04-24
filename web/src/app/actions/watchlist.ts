"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type WatchlistQuote = {
  price: number | null;
  change: number | null;
  change_percent: number | null;
  bid_price: number | null;
  ask_price: number | null;
  timestamp: number | null;
  source: string | null;
};

export type WatchlistItem = {
  ticker: string;
  created_at: string;
  quote: WatchlistQuote | null;
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
  return api.post<MutateResponse>("/watchlist", { ticker });
}

export async function removeFromWatchlist(ticker: string): Promise<api.ApiResult<MutateResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.del<MutateResponse>("/watchlist", { ticker });
}
