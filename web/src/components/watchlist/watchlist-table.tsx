"use client";

import Link from "next/link";
import { ArrowUp, ArrowDown, X, Star } from "@phosphor-icons/react";
import { toastManager } from "@/components/ui/toast";

type WatchlistItem = {
  ticker: string;
  name: string;
  price: number;
  change: number;
  high: number;
  low: number;
  volume: string;
  marketCap: string;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const WatchlistTable = ({ items }: { items: WatchlistItem[] }) => {
  const handleRemove = (ticker: string) => {
    toastManager.add({
      title: `${ticker} removed from watchlist`,
      type: "success",
    });
  };

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="overflow-hidden rounded-xl bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Change</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">High</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Low</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Volume</th>
              <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Mkt Cap</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr
                key={w.ticker}
                className="group border-b border-border last:border-0 transition-colors hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <Link href={`/stocks/${w.ticker}`} className="inline-flex items-center gap-2">
                    <Star size={14} weight="fill" className="shrink-0 text-amber-400" />
                    <span className="text-sm font-semibold leading-none">{w.ticker}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/stocks/${w.ticker}`}>
                    <span className="text-sm text-muted-foreground">{w.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-medium tabular-nums">${fmt(w.price)}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`inline-flex items-center gap-0.5 text-sm font-medium tabular-nums ${
                      w.change >= 0 ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {w.change >= 0 ? (
                      <ArrowUp size={12} weight="bold" />
                    ) : (
                      <ArrowDown size={12} weight="bold" />
                    )}
                    {w.change >= 0 ? "+" : ""}{w.change}%
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-right md:table-cell">
                  <span className="text-sm tabular-nums text-muted-foreground">${fmt(w.high)}</span>
                </td>
                <td className="hidden px-4 py-3 text-right md:table-cell">
                  <span className="text-sm tabular-nums text-muted-foreground">${fmt(w.low)}</span>
                </td>
                <td className="hidden px-4 py-3 text-right lg:table-cell">
                  <span className="text-sm tabular-nums text-muted-foreground">{w.volume}</span>
                </td>
                <td className="hidden px-4 py-3 text-right lg:table-cell">
                  <span className="text-sm tabular-nums text-muted-foreground">{w.marketCap}</span>
                </td>
                <td className="px-2 py-3 text-center">
                  <button
                    onClick={() => handleRemove(w.ticker)}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
