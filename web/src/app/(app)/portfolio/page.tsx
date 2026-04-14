import type { Metadata } from "next";
import { HoldingsTable } from "@/components/portfolio/holdings-table";
import { TransactionHistory } from "@/components/portfolio/transaction-history";
import { getAccounts } from "@/app/actions/auth";
import { getHoldings, getTransactions } from "@/app/actions/portfolio";

export const metadata: Metadata = { title: "Portfolio - R U Trading" };

export default async function PortfolioPage() {
  const accounts = await getAccounts();
  const accountId = accounts[0]?.tradingAccount.id;

  const [holdingsRes, transactionsRes] = accountId
    ? await Promise.all([getHoldings(accountId), getTransactions(accountId)])
    : [null, null];

  const holdings = holdingsRes?.ok ? holdingsRes.data.holdings : [];
  const transactions = transactionsRes?.ok ? transactionsRes.data.transactions : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Your current holdings and transaction history.
        </p>
      </div>
      <HoldingsTable holdings={holdings} />
      <TransactionHistory transactions={transactions} />
    </div>
  );
}
