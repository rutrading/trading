"use client";

import { ArrowUp, ArrowDown } from "@phosphor-icons/react";
import { WatchlistButton } from "./watchlist-button";
import type { StockInfo } from "./stock-data";
import { useQuote } from "@/components/ws-provider";
import { mergeQuote, type Quote } from "@/lib/quote";
import { fmtPrice } from "@/lib/format";

export const StockHeader = ({
  ticker,
  stock,
  initialQuote,
  watched,
}: {
  ticker: string;
  stock: StockInfo;
  initialQuote: Quote | null;
  watched: boolean;
}) => {
  const live = useQuote(ticker);
  const merged = mergeQuote(initialQuote, live);
  const price = merged.price ?? stock.price;
  const change = merged.change_percent ?? stock.change;
  const isPositive = change >= 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded bg-foreground/10 px-2 py-1 text-sm font-semibold">
            {ticker}
          </span>
          <WatchlistButton ticker={ticker} initialWatched={watched} />
        </div>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{stock.name}</h1>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums">${fmtPrice(price)}</span>
        <span
          className={`flex items-center gap-1 text-lg font-semibold tabular-nums ${
            isPositive ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {isPositive ? <ArrowUp size={16} weight="bold" /> : <ArrowDown size={16} weight="bold" />}
          {isPositive ? "+" : ""}{change}%
        </span>
      </div>
    </div>
  );
};
