"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { NewsCard } from "./news-card";
import { NEWS_ITEMS, SYMBOLS } from "./news-data";

export const NewsContent = () => {
  const [query, setQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredSymbols = useMemo(() => {
    if (!query) return SYMBOLS;
    const q = query.toLowerCase();
    return SYMBOLS.filter(
      (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [query]);

  const filteredNews = useMemo(() => {
    if (!selectedSymbol) return NEWS_ITEMS;
    return NEWS_ITEMS.filter((item) => item.symbol === selectedSymbol);
  }, [selectedSymbol]);

  const groupedNews = useMemo(() => {
    const groups: Record<string, typeof NEWS_ITEMS> = {};
    for (const item of filteredNews) {
      const key = item.symbol ?? "General";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [filteredNews]);

  const selectSymbol = (ticker: string) => {
    setSelectedSymbol(ticker);
    setQuery("");
    setShowDropdown(false);
  };

  const clearFilter = () => {
    setSelectedSymbol(null);
    setQuery("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">News</h1>
          <p className="text-sm text-muted-foreground">
            Latest financial news and market headlines.
          </p>
        </div>

        <div className="relative w-72">
          {selectedSymbol ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-input bg-background px-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{selectedSymbol}</span>
                <span className="text-muted-foreground">
                  {SYMBOLS.find((s) => s.ticker === selectedSymbol)?.name}
                </span>
              </div>
              <button
                onClick={clearFilter}
                className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative flex items-center">
              <MagnifyingGlass size={16} className="absolute left-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter by company..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {showDropdown && !selectedSymbol && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
              <div className="max-h-60 overflow-y-auto p-1">
                {filteredSymbols.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No companies found.</p>
                ) : (
                  filteredSymbols.map((s) => (
                    <button
                      key={s.ticker}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSymbol(s.ticker)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className="w-12 font-semibold">{s.ticker}</span>
                      <span className="text-muted-foreground">{s.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {Object.entries(groupedNews).map(([symbol, items]) => (
        <section key={symbol} className="rounded-2xl bg-accent p-6">
          <div className="mb-4 flex items-center gap-2">
            {symbol !== "General" ? (
              <Link
                href={`/news/${symbol}`}
                className="flex items-center gap-2 transition-opacity hover:opacity-70"
              >
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs font-semibold">
                  {symbol}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {SYMBOLS.find((s) => s.ticker === symbol)?.name}
                </span>
              </Link>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Market News</span>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <NewsCard key={i} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
