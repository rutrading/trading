import type { Metadata } from "next";
import { WatchlistTable } from "@/components/watchlist/watchlist-table";
import { getWatchlist } from "@/app/actions/watchlist";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Watchlist - R U Trading" };

export default async function WatchlistPage() {
  const [watchlistRes, members] = await Promise.all([getWatchlist(), getAccounts()]);
  const items = watchlistRes.ok ? watchlistRes.data.watchlist : [];

  const accountIds = members.map((m) => m.tradingAccount.id);
  const { holdings } = accountIds.length
    ? await getAllHoldings(accountIds)
    : { holdings: [] };

  // Same aggregation pattern as getPortfolioTimeSeries — sum qty per ticker
  // across all of the user's accounts so a position split across joint and
  // individual books shows its total exposure.
  const qtyByTicker: Record<string, number> = {};
  for (const h of holdings) {
    const qty = parseFloat(h.quantity);
    if (!(qty > 0)) continue;
    qtyByTicker[h.ticker] = (qtyByTicker[h.ticker] ?? 0) + qty;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "stock" : "stocks"} you&apos;re tracking.
        </p>
      </div>
      <WatchlistTable items={items} qtyByTicker={qtyByTicker} />
    </div>
  );
}
