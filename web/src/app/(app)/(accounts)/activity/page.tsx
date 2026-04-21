import type { Metadata } from "next";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings, getAllTransactions } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Activity - R U Trading" };

type Props = { searchParams: Promise<{ page?: string; account?: string }> };

export default async function ActivityPage({ searchParams }: Props) {
  const { page: pageParam, account: accountParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const allAccountIds = accounts.map((m) => m.tradingAccount.id);
  const accountsById: Record<number, { name: string; type: "investment" | "crypto" }> = {};
  for (const m of accounts) {
    accountsById[m.tradingAccount.id] = {
      name: m.tradingAccount.name,
      type: m.tradingAccount.type,
    };
  }

  const scopedId =
    accountParam && accountParam !== "all" ? Number(accountParam) : null;
  const activeIds =
    scopedId && allAccountIds.includes(scopedId) ? [scopedId] : allAccountIds;
  const scopedAccount = scopedId ? accountsById[scopedId] : null;

  // Need the cashByAccount map for the running-cash walk on transactions.
  const { cashByAccount } = await getAllHoldings(activeIds);
  const allTxns = await getAllTransactions(activeIds, cashByAccount, page);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          {scopedAccount
            ? `Transactions for ${scopedAccount.name}.`
            : "Transactions across all of your accounts."}
        </p>
      </div>
      <TransactionHistory
        transactions={allTxns.transactions}
        accountsById={scopedAccount ? undefined : accountsById}
        page={allTxns.page}
        perPage={allTxns.perPage}
        total={allTxns.total}
        scopedAccountId={scopedId ?? undefined}
      />
    </div>
  );
}
