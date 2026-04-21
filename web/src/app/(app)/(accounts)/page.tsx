import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ChartSection } from "@/components/dashboard/chart-section";
import { HoldingsList } from "@/components/dashboard/holdings-list";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { getQuote } from "@/app/actions/quotes";

export const metadata: Metadata = { title: "Dashboard - R U Trading" };

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

  const { holdings, totalCash } = await getAllHoldings(activeIds);

  const totalCost = holdings.reduce(
    (s, h) => s + parseFloat(h.quantity) * parseFloat(h.average_cost),
    0,
  );

  // Live market value across all holdings — Redis-cached, so this is cheap.
  // Falls back to cost basis per-holding if a quote can't be fetched.
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const quoteResults = await Promise.all(uniqueTickers.map((t) => getQuote(t)));
  const priceByTicker = new Map<string, number>();
  for (let i = 0; i < uniqueTickers.length; i++) {
    const res = quoteResults[i];
    if (res.ok && res.data.price != null) {
      priceByTicker.set(uniqueTickers[i], res.data.price);
    }
  }
  const totalMarketValue = holdings.reduce((s, h) => {
    const qty = parseFloat(h.quantity);
    const price = priceByTicker.get(h.ticker) ?? parseFloat(h.average_cost);
    return s + qty * price;
  }, 0);

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
          <ChartSection />
        </div>
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <Link href={scopedId ? `/holdings?account=${scopedId}` : "/holdings"}>
            <Button variant="ghost" size="sm">
              See All <CaretRight size={14} />
            </Button>
          </Link>
        </div>
        <HoldingsList holdings={holdings} accountsById={accountsById} />
      </div>
    </div>
  );
}
