"use server";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

type SymbolRow = typeof schema.symbol.$inferSelect;

type SymbolResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  asset_class: "us_equity" | "crypto";
};

type SearchResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

function toSearchResult(row: SymbolResult): SearchResult {
  return {
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    assetClass: row.asset_class,
  };
}

type SymbolListResponse = {
  items: SymbolResult[];
  has_more: boolean;
  total: number;
};

export type PagedSymbols = {
  items: SearchResult[];
  hasMore: boolean;
  total: number;
};

export async function listSymbols({
  query,
  limit = 50,
  offset = 0,
}: {
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<PagedSymbols> {
  const session = await getSession();
  if (!session) return { items: [], hasMore: false, total: 0 };

  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  const q = (query ?? "").trim();
  if (q) params.q = q;

  const res = await api.get<SymbolListResponse>("/symbols", params);
  if (!res.ok) return { items: [], hasMore: false, total: 0 };

  return {
    items: res.data.items.map(toSearchResult),
    hasMore: res.data.has_more,
    total: res.data.total,
  };
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const session = await getSession();
  if (!session) return [];

  const q = query.trim();
  if (!q) return [];

  const res = await api.get<SymbolResult[]>("/symbols/search", { q });
  return res.ok ? res.data.map(toSearchResult) : [];
}

export async function getTrendingSymbols(
  assetClass?: "us_equity" | "crypto",
): Promise<SearchResult[]> {
  const session = await getSession();
  if (!session) return [];

  const res = await api.get<SymbolResult[]>("/symbols/trending", {
    asset_class: assetClass,
  });
  return res.ok ? res.data.map(toSearchResult) : [];
}

export async function trackSymbol(ticker: string): Promise<void> {
  const session = await getSession();
  if (!session) return;

  await api.post("/symbols/track", { ticker });
}

export const getSymbol = cache(
  async (ticker: string): Promise<SymbolRow | null> => {
    const session = await getSession();
    if (!session) return null;

    const t = ticker.toUpperCase().trim();
    if (!t) return null;

    const existing = await db.query.symbol.findFirst({
      where: eq(schema.symbol.ticker, t),
    });
    if (existing) return existing;

    const res = await api.put("/symbols/" + encodeURIComponent(t));
    if (!res.ok) return null;

    return (
      (await db.query.symbol.findFirst({
        where: eq(schema.symbol.ticker, t),
      })) ?? null
    );
  },
);
