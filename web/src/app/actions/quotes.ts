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
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  timestamp: number;
};

type BulkQuotesResponse = {
  quotes: Record<string, QuoteSnapshot>;
};

export async function getQuote(
  ticker: string,
): Promise<api.ApiResult<QuoteSnapshot>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<QuoteSnapshot>("/quote", { ticker });
}

// Bulk quotes — one backend round-trip for N tickers instead of N. The
// response is keyed by ticker; tickers that the backend failed to resolve
// (404, rate limit, transient Alpaca error) are silently omitted from the
// map. Callers should treat `quotes[ticker]` being undefined as "use a
// fallback price" rather than a hard failure.
export async function getQuotes(
  tickers: string[],
): Promise<Record<string, QuoteSnapshot>> {
  const session = await getSession();
  if (!session) return {};
  const cleaned = tickers
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return {};
  // Dedupe — backend handles it too, but doing it here makes the URL
  // shorter and the cache key (if any future caller wraps this) stable.
  const unique = Array.from(new Set(cleaned));
  const res = await api.get<BulkQuotesResponse>("/quotes", {
    tickers: unique.join(","),
  });
  return res.ok ? res.data.quotes : {};
}
