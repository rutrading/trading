import type { Metadata } from "next";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { getWatchlist } from "@/app/actions/watchlist";

export const metadata: Metadata = { title: "Watchlist - R U Trading" };

export default async function WatchlistPage() {
  const res = await getWatchlist();
  const items = res.ok ? res.data.watchlist : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "stock" : "stocks"} you&apos;re tracking.
        </p>
      </div>
      <WatchlistTable items={items} />
    </div>
  );
}
