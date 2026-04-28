"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";
import type { Quote } from "@/lib/quote";

type BulkQuotesResponse = {
  quotes: Record<string, Quote>;
};

export type QuoteabilityItem = {
  quoteable: boolean;
  reason: string | null;
};

type QuoteabilityResponse = {
  symbols: Record<string, QuoteabilityItem>;
};

export async function getQuote(
  ticker: string,
): Promise<api.ApiResult<Quote>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<Quote>("/quote", { ticker });
}

// Bulk quotes — one backend round-trip for N tickers instead of N. The
// response is keyed by ticker; tickers that the backend failed to resolve
// (404, rate limit, transient Alpaca error) are silently omitted from the
// map. Callers should treat `quotes[ticker]` being undefined as "use a
// fallback price" rather than a hard failure.
export async function getQuotes(
  tickers: string[],
): Promise<Record<string, Quote>> {
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

export async function getQuoteability(
  tickers: string[],
): Promise<Record<string, QuoteabilityItem>> {
  const session = await getSession();
  if (!session) return {};
  const cleaned = tickers
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return {};
  const unique = Array.from(new Set(cleaned));
  const res = await api.get<QuoteabilityResponse>("/quoteability", {
    tickers: unique.join(","),
  });
  return res.ok ? res.data.symbols : {};
}
