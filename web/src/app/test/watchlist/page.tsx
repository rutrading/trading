import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUp, ArrowDown, X, Star } from "@phosphor-icons/react/ssr";

export const metadata: Metadata = { title: "Watchlist - R U Trading" };

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const WATCHLIST = [
  { ticker: "AAPL", name: "Apple Inc.", price: 178.5, change: 2.34, high: 182.1, low: 176.3, volume: "52.3M", marketCap: "2.78T" },
  { ticker: "GOOGL", name: "Alphabet", price: 155.8, change: -0.87, high: 158.2, low: 154.9, volume: "28.1M", marketCap: "1.94T" },
  { ticker: "AMZN", name: "Amazon", price: 185.6, change: 1.52, high: 187.4, low: 183.2, volume: "45.7M", marketCap: "1.92T" },
  { ticker: "NVDA", name: "NVIDIA", price: 880.3, change: 3.21, high: 895.0, low: 868.5, volume: "38.9M", marketCap: "2.17T" },
  { ticker: "META", name: "Meta Platforms", price: 520.8, change: -1.15, high: 528.4, low: 518.1, volume: "19.4M", marketCap: "1.33T" },
  { ticker: "NFLX", name: "Netflix", price: 625.4, change: 0.78, high: 631.2, low: 620.8, volume: "8.2M", marketCap: "271B" },
  { ticker: "AMD", name: "AMD", price: 168.9, change: 4.56, high: 172.3, low: 161.5, volume: "62.1M", marketCap: "273B" },
  { ticker: "DIS", name: "Walt Disney", price: 112.3, change: -0.42, high: 113.8, low: 111.5, volume: "12.6M", marketCap: "205B" },
];

export default function WatchlistPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
          <p className="text-sm text-muted-foreground">
            {WATCHLIST.length} stocks you&apos;re tracking.
          </p>
        </div>
      </div>

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
              {WATCHLIST.map((w) => (
                <tr
                  key={w.ticker}
                  className="group border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/test/stocks/${w.ticker}`} className="flex items-center gap-2">
                      <Star size={14} weight="fill" className="text-amber-400" />
                      <span className="text-sm font-semibold">{w.ticker}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/test/stocks/${w.ticker}`}>
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
                    <span className="text-sm tabular-nums text-muted-foreground">${w.marketCap}</span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
