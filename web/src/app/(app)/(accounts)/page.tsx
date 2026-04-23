import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
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
import { getQuote } from "@/app/actions/quotes";

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
  const accountsById: Record<number, { name: string; type: "investment" | "crypto" }> = {};
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
  }

  const allAccountIds = accounts.map((m) => m.tradingAccount.id);
  // Scope to one account when ?account=<id> is present and valid; otherwise all.
  const scopedId =
    accountParam && accountParam !== "all" ? Number(accountParam) : null;
  const activeIds =
    scopedId && allAccountIds.includes(scopedId) ? [scopedId] : allAccountIds;
  const scopedAccount = scopedId ? accountsById[scopedId] : null;

  // Holdings first because every other downstream fetch (quotes, historical
  // bars, time-series chart) needs the unique-ticker list. Doing it as a
  // single round-trip means the per-account /holdings hits don't double up
  // with the redundant fetch the time-series action used to do internally.
  const [{ holdings, totalCash }, openOrders] = await Promise.all([
    getAllHoldings(activeIds),
    getOpenOrdersAcrossAccounts(activeIds, PREVIEW_LIMIT),
  ]);

  const totalCost = holdings.reduce(
    (s, h) => s + parseFloat(h.quantity) * parseFloat(h.average_cost),
    0,
  );

  // Quotes and historical bars only depend on holdings, so fan them out
  // together — this is the parallel branch that the previous serialization
  // was missing. Both inputs feed the chart-augmentation step below.
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const [quoteResults, portfolioSeries] = await Promise.all([
    Promise.all(uniqueTickers.map((t) => getQuote(t))),
    getPortfolioTimeSeries(holdings, totalCash, 30),
  ]);
  const priceByTicker = new Map<string, number>();
  const changeByTicker = new Map<string, number>();
  for (let i = 0; i < uniqueTickers.length; i++) {
    const res = quoteResults[i];
    if (res.ok && res.data.price != null) {
      priceByTicker.set(uniqueTickers[i], res.data.price);
      if (res.data.change != null) {
        changeByTicker.set(uniqueTickers[i], res.data.change);
      }
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
      <div className="space-y-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-5xl font-bold tabular-nums tracking-tight">
            ${fmt(totalMarketValue + totalCash)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {scopedAccount ? `${scopedAccount.name} · Portfolio Value` : "Portfolio Value"}
          </p>
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
                <p className="text-2xl font-semibold tabular-nums">{accounts.length}</p>
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
        accountIds={activeIds}
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
