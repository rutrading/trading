import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAccounts, getSession } from "@/app/actions/auth";
import { getStrategies, getStrategyCatalog, getStrategyRuns } from "@/app/actions/strategies";
import { AutoTradingTestClient } from "./test-client";

export const metadata: Metadata = {
  title: "Auto Trading Test - R U Trading",
};

export default async function AutoTradingTestPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  if (process.env.NODE_ENV !== "development") redirect("/");

  const accounts = await getAccounts();
  const investmentAccounts = accounts
    .map((x) => x.tradingAccount)
    .filter((a) => a.type === "investment");

  const selectedAccountId = investmentAccounts[0]?.id;
  const [catalogRes, strategiesRes, runsRes] = await Promise.all([
    getStrategyCatalog(),
    selectedAccountId
      ? getStrategies(selectedAccountId)
      : Promise.resolve({ ok: true as const, data: { strategies: [] } }),
    selectedAccountId
      ? getStrategyRuns(selectedAccountId)
      : Promise.resolve({ ok: true as const, data: { runs: [], total: 0, page: 1, per_page: 50 } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auto Trading Test</h1>
        <p className="text-sm text-muted-foreground">
          Dev-only control panel for automated strategy creation and live run checks.
        </p>
      </div>

      <AutoTradingTestClient
        accounts={investmentAccounts.map((a) => ({ id: a.id, name: a.name }))}
        initialAccountId={selectedAccountId ?? null}
        initialCatalog={catalogRes.ok ? catalogRes.data.templates : []}
        initialStrategies={strategiesRes.ok ? strategiesRes.data.strategies : []}
        initialRuns={runsRes.ok ? runsRes.data.runs : []}
      />
    </div>
  );
}
