import type { Metadata } from "next";
import { HoldingsTable, type InitialQuote } from "@/components/portfolio/holdings-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { getQuote } from "@/app/actions/quotes";

export const metadata: Metadata = { title: "Holdings - R U Trading" };

type Props = { searchParams: Promise<{ account?: string }> };

export default async function HoldingsPage({ searchParams }: Props) {
  const { account: accountParam } = await searchParams;

  const accounts = await getAccounts();
  const allAccountIds = accounts.map((m) => m.tradingAccount.id);
  const scopedId =
    accountParam && accountParam !== "all" ? Number(accountParam) : null;
  const activeIds =
    scopedId && allAccountIds.includes(scopedId) ? [scopedId] : allAccountIds;
  const scopedAccount = scopedId
    ? accounts.find((m) => m.tradingAccount.id === scopedId)?.tradingAccount
    : null;

  const { holdings, totalCash } = await getAllHoldings(activeIds);

  // Server-side REST snapshot per unique ticker. Backstops the WS feed so the
  // table renders real numbers after market close (Alpaca SIP only ticks
  // during regular hours) and during the brief gap before the WS pushes its
  // first tick on a fresh connection. Crypto snapshots are 24/7.
  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const quoteResults = await Promise.all(uniqueTickers.map((t) => getQuote(t)));
  const initialQuotes: Record<string, InitialQuote> = {};
  for (let i = 0; i < uniqueTickers.length; i++) {
    const res = quoteResults[i];
    if (res.ok) {
      initialQuotes[uniqueTickers[i]] = {
        price: res.data.price,
        change: res.data.change,
      };
    }
  }

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
