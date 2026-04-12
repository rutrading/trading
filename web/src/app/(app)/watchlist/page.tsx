import type { Metadata } from "next";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";

export const metadata: Metadata = { title: "Watchlist - R U Trading" };

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          {WATCHLIST.length} stocks you&apos;re tracking.
        </p>
      </div>
      <WatchlistTable items={WATCHLIST} />
    </div>
  );
}
