import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { ChartSection } from "@/components/dashboard/chart-section";
import { HoldingsList } from "@/components/dashboard/holdings-list";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Dashboard - R U Trading" };

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function DashboardPage() {
  const accounts = await getAccounts();
  const accountIds = accounts.map((m) => m.tradingAccount.id);
  const accountsById: Record<number, { name: string; type: "investment" | "crypto" }> = {};
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
  }

  const { holdings, totalCash } = await getAllHoldings(accountIds);

  const totalCost = holdings.reduce(
    (s, h) => s + parseFloat(h.quantity) * parseFloat(h.average_cost),
    0,
  );

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-baseline gap-4">
          <h1 className="text-5xl font-bold tabular-nums tracking-tight">
            ${fmt(totalCost + totalCash)}
          </h1>
          <p className="text-sm text-muted-foreground">Portfolio Value</p>
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
            <div>
              <p className="text-2xl font-semibold tabular-nums">{accounts.length}</p>
              <p className="text-xs text-muted-foreground">Accounts</p>
            </div>
          </div>
          <ChartSection />
        </div>
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Holdings</h2>
          <Link href="/portfolio">
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
