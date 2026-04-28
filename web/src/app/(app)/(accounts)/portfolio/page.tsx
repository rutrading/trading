import type { Metadata } from "next";

import { getAccounts } from "@/app/actions/auth";
import {
  getAllHoldings,
  getPortfolioTimeSeries,
  type PortfolioPoint,
} from "@/app/actions/portfolio";
import { getQuotes } from "@/app/actions/quotes";
import { AllocationPie } from "@/components/dashboard/allocation-pie";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { PageHeader } from "@/components/ui/page";
import { fmtUsd } from "@/lib/format";
import { resolveAccountScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

type Props = { searchParams: Promise<{ account?: string }> };

export default async function PortfolioPage({ searchParams }: Props) {
  const { account: accountParam } = await searchParams;
  const accounts = await getAccounts();
  const { scopedAccount, activeIds } = resolveAccountScope(accounts, accountParam);

  const { holdings, totalCash } = await getAllHoldings(activeIds);
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const [quotes, portfolioSeries] = await Promise.all([
    getQuotes(uniqueTickers),
    getPortfolioTimeSeries(holdings, totalCash, 30),
  ]);

  let totalMarketValue = 0;
  let stocksValue = 0;
  let cryptoValue = 0;
  for (const h of holdings) {
    const qty = parseFloat(h.quantity);
    const price = quotes[h.ticker]?.price ?? parseFloat(h.average_cost);
    const value = qty * price;
    totalMarketValue += value;
    if (h.asset_class === "crypto") cryptoValue += value;
    else stocksValue += value;
  }

  const livePortfolioValue = totalMarketValue + totalCash;
  const everyTickerHasLivePrice = uniqueTickers.every((ticker) => {
    return quotes[ticker]?.price != null;
  });
  const tickerQuantities: Record<string, string> = {};
  for (const h of holdings) {
    const previous = tickerQuantities[h.ticker]
      ? parseFloat(tickerQuantities[h.ticker])
      : 0;
    tickerQuantities[h.ticker] = String(previous + parseFloat(h.quantity));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  let augmentedSeries: PortfolioPoint[] = portfolioSeries;
  if (everyTickerHasLivePrice && portfolioSeries.length > 0) {
    const lastTime = portfolioSeries[portfolioSeries.length - 1].time;
    if (nowSec > lastTime) {
      augmentedSeries = [...portfolioSeries, { time: nowSec, value: livePortfolioValue }];
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader divider={false} className="h-auto px-0 pb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {scopedAccount
              ? `Portfolio overview for ${scopedAccount.name}.`
              : "Portfolio overview across your selected accounts."}
          </p>
        </div>
      </PageHeader>

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">Portfolio Value</p>
        <h2 className="text-4xl font-semibold tabular-nums tracking-tight md:text-5xl">
          {fmtUsd(livePortfolioValue)}
        </h2>
      </div>

      <PortfolioChart
        key={activeIds.join(",")}
        data={augmentedSeries}
        tickerQuantities={tickerQuantities}
        totalCash={totalCash}
        liveValue={everyTickerHasLivePrice ? livePortfolioValue : null}
        initialDays={30}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <AllocationPie
          cash={totalCash}
          stocksValue={stocksValue}
          cryptoValue={cryptoValue}
        />
        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Snapshot</h2>
          <div className="grid gap-3 rounded-xl bg-card p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-lg font-semibold tabular-nums">{fmtUsd(totalCash)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invested</p>
              <p className="text-lg font-semibold tabular-nums">
                {fmtUsd(totalMarketValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Holdings</p>
              <p className="text-lg font-semibold tabular-nums">{holdings.length}</p>
            </div>
          </div>
        </div>
      </div>

      <HoldingsTable holdings={holdings} totalCash={totalCash} initialQuotes={quotes} />
    </div>
  );
}
