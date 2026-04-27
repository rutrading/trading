import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { getQuotes } from "@/app/actions/quotes";
import { resolveAccountScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Holdings - R U Trading" };

type Props = { searchParams: Promise<{ account?: string }> };

export default async function HoldingsPage({ searchParams }: Props) {
  const { account: accountParam } = await searchParams;

  const accounts = await getAccounts();
  const { scopedAccount, activeIds } = resolveAccountScope(accounts, accountParam);

  const { holdings, totalCash } = await getAllHoldings(activeIds);

  // Server-side REST snapshot for every unique ticker in one bulk hop.
  // Backstops the WS feed so the table renders real numbers after market
  // close (Alpaca SIP only ticks during regular hours) and during the brief
  // gap before the WS pushes its first tick on a fresh connection. Crypto
  // snapshots are 24/7.
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const initialQuotes = await getQuotes(uniqueTickers);

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
      <HoldingsTable
        holdings={holdings}
        totalCash={totalCash}
        initialQuotes={initialQuotes}
      />
    </div>
  );
}
