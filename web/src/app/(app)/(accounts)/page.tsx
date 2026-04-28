import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { HoldingsList } from "@/components/dashboard/holdings-list";
import { OpenOrdersList } from "@/components/dashboard/open-orders-list";
import { PerformanceCard } from "@/components/dashboard/performance-card";
import { AllocationPie } from "@/components/dashboard/allocation-pie";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { getAccounts } from "@/app/actions/auth";
import {
  getAllHoldings,
  getPortfolioTimeSeries,
  type PortfolioPoint,
} from "@/app/actions/portfolio";
import { getOpenOrdersAcrossAccounts } from "@/app/actions/orders";
import { getQuotes } from "@/app/actions/quotes";
import { getWatchlist } from "@/app/actions/watchlist";
import { resolveBrokerageScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Dashboard - R U Trading" };

const PREVIEW_LIMIT = 5;

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Props = {
  searchParams: Promise<{ account?: string }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const { account: accountParam } = await searchParams;
  const accounts = await getAccounts();
  const { scopedId, scopedAccount, activeIds, allAccountIds, accountsById } =
    resolveBrokerageScope(accounts, accountParam);

  // Holdings first because every other downstream fetch (quotes, historical
  // bars, time-series chart) needs the unique-ticker list. Doing it as a
  // single round-trip means the per-account /holdings hits don't double up
  // with the redundant fetch the time-series action used to do internally.
  const [{ holdings, totalCash }, openOrders, watchlistRes] = await Promise.all([
    getAllHoldings(activeIds),
    getOpenOrdersAcrossAccounts(activeIds, PREVIEW_LIMIT),
    getWatchlist(),
  ]);
  const watchlist = watchlistRes.ok ? watchlistRes.data.watchlist : [];

  const totalCost = holdings.reduce(
    (s, h) => s + parseFloat(h.quantity) * parseFloat(h.average_cost),
    0,
  );

  // Quotes and historical bars only depend on holdings, so fan them out
  // together — this is the parallel branch the previous serialization was
  // missing. Both inputs feed the chart-augmentation step below. Bulk
  // /quotes makes the per-ticker dimension one HTTP hop instead of N.
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const [quotes, portfolioSeries] = await Promise.all([
    getQuotes(uniqueTickers),
    getPortfolioTimeSeries(holdings, totalCash, 30),
  ]);
  const priceByTicker = new Map<string, number>();
  const changeByTicker = new Map<string, number>();
  for (const ticker of uniqueTickers) {
    const q = quotes[ticker];
    if (q && q.price != null) {
      priceByTicker.set(ticker, q.price);
      if (q.change != null) changeByTicker.set(ticker, q.change);
    }
  }

  let totalMarketValue = 0;
  let totalTodayGain = 0;
  let stocksValue = 0;
  let cryptoValue = 0;
  for (const h of holdings) {
    const qty = parseFloat(h.quantity);
    const price = priceByTicker.get(h.ticker) ?? parseFloat(h.average_cost);
    const value = qty * price;
    totalMarketValue += value;
    if (h.asset_class === "crypto") cryptoValue += value;
    else stocksValue += value;
    const change = changeByTicker.get(h.ticker);
    if (change != null) totalTodayGain += qty * change;
  }
  const totalTotalGain = totalMarketValue - totalCost;
  const prevClosePortfolio = totalMarketValue - totalTodayGain;
  const todayGainPct =
    prevClosePortfolio > 0 ? (totalTodayGain / prevClosePortfolio) * 100 : 0;
  const totalGainPct =
    totalCost > 0 ? (totalTotalGain / totalCost) * 100 : 0;

  // Append a synthetic "now" point so the chart's last value matches the
  // header's live Portfolio Value instead of lagging at last-close. We only
  // append when *every* held ticker has a live price — otherwise the
  // synthetic value would silently use cost basis for missing tickers and
  // mislead the trend. Skipped when the historical series is empty (no bars
  // yet) or when "now" isn't strictly after the last bar.
  const everyTickerHasLivePrice = uniqueTickers.every((t) =>
    priceByTicker.has(t),
  );
  const livePortfolioValue = totalMarketValue + totalCash;
  // Server Component: this function runs once per request, so calling
  // Date.now() during "render" is fine — React's purity rule targets client
  // components that may re-render. Disable the lint here rather than thread
  // a clock through every server-side call site.
  // eslint-disable-next-line react-hooks/purity
  const nowSec = Math.floor(Date.now() / 1000);
  let augmentedSeries: PortfolioPoint[] = portfolioSeries;
  if (everyTickerHasLivePrice && portfolioSeries.length > 0) {
    const lastTime = portfolioSeries[portfolioSeries.length - 1].time;
    if (nowSec > lastTime) {
      augmentedSeries = [
        ...portfolioSeries,
        { time: nowSec, value: livePortfolioValue },
      ];
    }
  }

  // Per-ticker quantity (summed across accounts) — handed to the portfolio
  // chart as a prop so its period-change handler only has to refetch bars,
  // not re-derive holdings or quotes the dashboard already loaded above.
  const tickerQuantities: Record<string, string> = {};
  for (const h of holdings) {
    const prev = tickerQuantities[h.ticker]
      ? parseFloat(tickerQuantities[h.ticker])
      : 0;
    tickerQuantities[h.ticker] = String(prev + parseFloat(h.quantity));
  }

  // Top-N preview by current market value, falling back to cost basis when
  // we don't have a live quote — same fallback the Portfolio Value tile uses.
  const topHoldings = [...holdings]
    .map((h) => {
      const qty = parseFloat(h.quantity);
      const price = priceByTicker.get(h.ticker) ?? parseFloat(h.average_cost);
      return { holding: h, value: qty * price };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, PREVIEW_LIMIT)
    .map((r) => r.holding);

  const ordersHref = scopedId ? `/orders?account=${scopedId}` : "/orders";
  const holdingsHref = scopedId ? `/holdings?account=${scopedId}` : "/holdings";

  return (
    <div className="space-y-8">
      <PageHeader divider={false} className="h-auto px-0 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Account overview and market activity.
          </p>
        </div>
      </PageHeader>

      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Portfolio Value</p>
          <h2 className="text-4xl font-semibold tabular-nums tracking-tight md:text-5xl">
            ${fmt(totalMarketValue + totalCash)}
          </h2>
        </div>

        <div className="flex items-end justify-between gap-8">
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{holdings.length}</p>
              <p className="text-xs text-muted-foreground">Holdings</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">${fmt(totalCash)}</p>
              <p className="text-xs text-muted-foreground">Cash Balance</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">${fmt(totalCost)}</p>
              <p className="text-xs text-muted-foreground">Invested</p>
            </div>
            {!scopedAccount && (
              <div>
                <p className="text-2xl font-semibold tabular-nums">{allAccountIds.length}</p>
                <p className="text-xs text-muted-foreground">Accounts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <PerformanceCard
          todayGain={totalTodayGain}
          todayGainPct={todayGainPct}
          totalGain={totalTotalGain}
          totalGainPct={totalGainPct}
          watchlist={watchlist}
        />
        <AllocationPie
          cash={totalCash}
          stocksValue={stocksValue}
          cryptoValue={cryptoValue}
        />
      </div>

      <PortfolioChart
        // `key` triggers a full remount when the user switches account scope
        // in the sidebar — drops any user-selected period and re-seats the
        // chart's local state from the new server props.
        key={activeIds.join(",")}
        data={augmentedSeries}
        tickerQuantities={tickerQuantities}
        totalCash={totalCash}
        // null tells the chart to skip the synthetic "now" point. Same
        // condition the server uses to decide whether to augment the
        // initial series.
        liveValue={everyTickerHasLivePrice ? livePortfolioValue : null}
        initialDays={30}
      />

      <div className="rounded-2xl bg-accent p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <Link href={holdingsHref}>
            <Button variant="ghost" size="sm">
              See All <CaretRight size={14} />
            </Button>
          </Link>
        </div>
        <HoldingsList
          holdings={topHoldings}
          accountsById={accountsById}
          priceByTicker={priceByTicker}
          changeByTicker={changeByTicker}
        />
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open Orders</h2>
          <Link href={ordersHref}>
            <Button variant="ghost" size="sm">
              See All <CaretRight size={14} />
            </Button>
          </Link>
        </div>
        <OpenOrdersList orders={openOrders} accountsById={accountsById} />
      </div>
    </div>
  );
}
