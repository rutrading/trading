import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { resolveBrokerageScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Holdings - R U Trading" };

type Props = { searchParams: Promise<{ account?: string }> };

export default async function HoldingsPage({ searchParams }: Props) {
  const { account: accountParam } = await searchParams;

  const accounts = await getAccounts();
  const { scopedAccount, activeIds } = resolveBrokerageScope(accounts, accountParam);

  const { holdings, totalCash } = await getAllHoldings(activeIds);

  // No server-side bulk quote seed — the WS provider pushes a Redis
  // snapshot frame on subscribe that fills prices client-side, so
  // blocking the server render on a per-ticker quote fan-out only adds
  // latency.
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
        <p className="text-sm text-muted-foreground">
          {scopedAccount
            ? `Positions for ${scopedAccount.name}.`
            : "Positions across all of your accounts."}
        </p>
      </div>
      <HoldingsTable holdings={holdings} totalCash={totalCash} />
    </div>
  );
}
