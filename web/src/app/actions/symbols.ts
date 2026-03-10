"use server";

import { cache } from "react";
import { eq, or, ilike, sql, and } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

type SymbolRow = typeof schema.symbol.$inferSelect;

type SearchResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

/**
 * Searches the local symbol table by ticker prefix or name substring.
 * No external API calls. Used by the search bar.
 */
export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  return db
    .select({
      ticker: schema.symbol.ticker,
      name: schema.symbol.name,
      exchange: schema.symbol.exchange,
      assetClass: schema.symbol.assetClass,
    })
    .from(schema.symbol)
    .where(
      and(
        eq(schema.symbol.tradable, true),
        or(
          ilike(schema.symbol.ticker, `${q}%`),
          ilike(schema.symbol.name, `%${q}%`),
        ),
      ),
    )
    .orderBy(
      sql`CASE
        WHEN UPPER(${schema.symbol.ticker}) = UPPER(${q}) THEN 0
        WHEN ${schema.symbol.ticker} ILIKE ${q + "%"} THEN 1
        ELSE 2
      END`,
    )
    .limit(8);
}

/**
 * Returns a single symbol from the local table.
 * If not found, calls the FastAPI backend to fetch + insert it from Alpaca.
 */
export const getSymbol = cache(
  async (ticker: string): Promise<SymbolRow | null> => {
    const t = ticker.toUpperCase().trim();
    if (!t) return null;

    const existing = await db.query.symbol.findFirst({
      where: eq(schema.symbol.ticker, t),
    });

    if (existing) return existing;

    // Not in local DB -- ask the backend to fetch from Alpaca and insert
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
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
