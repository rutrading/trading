import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings, getAllTransactions } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

type Props = { searchParams: Promise<{ page?: string }> };

export default async function PortfolioPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const accountIds = accounts.map((m) => m.tradingAccount.id);
  const accountsById: Record<number, { name: string; type: "investment" | "crypto" }> = {};
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
  }

  const allHoldings = await getAllHoldings(accountIds);
  const allTxns = await getAllTransactions(
    accountIds,
    allHoldings.cashByAccount,
    page,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Holdings and transactions across all of your accounts.
        </p>
      </div>
      <HoldingsTable
        holdings={allHoldings.holdings}
        accountsById={accountsById}
      />
      <TransactionHistory
        transactions={allTxns.transactions}
        accountsById={accountsById}
        page={allTxns.page}
        perPage={allTxns.perPage}
        total={allTxns.total}
      />
    </div>
  );
}
