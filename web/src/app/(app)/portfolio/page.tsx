import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { getAccounts } from "@/app/actions/auth";
import { getHoldings, getTransactions } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

type Props = { searchParams: Promise<{ page?: string }> };

export default async function PortfolioPage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const accounts = await getAccounts();
  const accountId = accounts[0]?.tradingAccount.id;

  const [holdingsRes, transactionsRes] = accountId
    ? await Promise.all([
        getHoldings(accountId),
        getTransactions(accountId, page),
      ])
    : [null, null];

  const holdings = holdingsRes?.ok ? holdingsRes.data.holdings : [];
  const transactions = transactionsRes?.ok ? transactionsRes.data.transactions : [];
  const total = transactionsRes?.ok ? transactionsRes.data.total : 0;
  const perPage = transactionsRes?.ok ? transactionsRes.data.per_page : 25;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your current holdings and transaction history.
        </p>
      </div>
      <HoldingsTable holdings={holdings} />
      <TransactionHistory
        transactions={transactions}
        page={page}
        perPage={perPage}
        total={total}
      />
    </div>
  );
}
