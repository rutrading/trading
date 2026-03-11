"use server";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getSession } from "@/app/actions/auth";

type SymbolRow = typeof schema.symbol.$inferSelect;

type SearchResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

/**
 * Searches symbols via the FastAPI backend (Redis-cached).
 * Falls back to empty array on error.
 */
export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const session = await getSession();
  if (!session) return [];

  const q = query.trim();
  if (!q || !backendUrl) return [];

  try {
    const res = await fetch(
      `${backendUrl}/symbols/search?q=${encodeURIComponent(q)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];

    const data: Array<{
      ticker: string;
      name: string;
      exchange: string | null;
      asset_class: "us_equity" | "crypto";
    }> = await res.json();

    // map snake_case backend response to camelCase frontend type
    return data.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      assetClass: row.asset_class,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns the top trending symbols by selection count.
 * Backed by a Redis sorted set on the backend.
 */
export async function getTrendingSymbols(): Promise<SearchResult[]> {
  const session = await getSession();
  if (!session) return [];
  if (!backendUrl) return [];

  try {
    const res = await fetch(`${backendUrl}/symbols/trending`, {
      cache: "no-store",
    });
    if (!res.ok) return [];

    const data: Array<{
      ticker: string;
      name: string;
      exchange: string | null;
      asset_class: "us_equity" | "crypto";
    }> = await res.json();

    return data.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      exchange: row.exchange,
      assetClass: row.asset_class,
    }));
  } catch {
    return [];
  }
}

/**
 * Increment the trending score for a ticker when a user selects it.
 * Fire-and-forget from the frontend.
 */
export async function trackSymbol(ticker: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  if (!backendUrl) return;

  try {
    await fetch(
      `${backendUrl}/symbols/track?ticker=${encodeURIComponent(ticker)}`,
      { method: "POST", cache: "no-store" },
    );
  } catch {
    // non-critical, swallow errors
  }
}

/**
 * Returns a single symbol from the local table.
 * If not found, calls the FastAPI backend to fetch + insert it from Alpaca.
 */
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

    // Not in local DB -- ask the backend to fetch from Alpaca and insert
    if (!backendUrl) return null;

    try {
      const res = await fetch(`${backendUrl}/symbols/${encodeURIComponent(t)}`, {
        method: "PUT",
        cache: "no-store",
      });
      if (!res.ok) return null;

      // Backend inserted it, now read from our DB
      return (
        (await db.query.symbol.findFirst({
          where: eq(schema.symbol.ticker, t),
        })) ?? null
      );
    } catch {
      return null;
    }
  },
);
