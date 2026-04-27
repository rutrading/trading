import type { Metadata } from "next";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { getAccounts } from "@/app/actions/auth";
import { getAllTransactions } from "@/app/actions/portfolio";
import { resolveBrokerageScope } from "@/lib/accounts";

export const metadata: Metadata = { title: "Activity - R U Trading" };

type Props = { searchParams: Promise<{ page?: string; account?: string }> };

export default async function ActivityPage({ searchParams }: Props) {
  const { page: pageParam, account: accountParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const { scopedId, scopedAccount, activeIds, accountsById } = resolveBrokerageScope(
    accounts,
    accountParam,
  );

  // Build the cashByAccount map from `tradingAccount.balance` rows we
  // already loaded above. The previous shape called `getAllHoldings` here
  // just to read its `cashByAccount` field — that fanned out per-account
  // /holdings requests and discarded the entire holdings array on the
  // floor. The trading_account row already carries the authoritative cash
  // balance, so derive it directly.
  const cashByAccount: Record<number, string> = {};
  for (const m of accounts) {
    if (activeIds.includes(m.tradingAccount.id)) {
      cashByAccount[m.tradingAccount.id] = String(m.tradingAccount.balance);
    }
  }
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
