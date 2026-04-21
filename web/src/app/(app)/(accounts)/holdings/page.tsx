import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";

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
