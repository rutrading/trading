import type { Metadata } from "next";
import Link from "next/link";

import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page";
import { Wallet } from "@phosphor-icons/react/ssr";
import { TradeForm, type TradeAccount } from "@/components/trade/trade-form";
import { isUSMarketOpen } from "@/lib/market-hours";
import {
  filterBrokerageMembers,
  type BrokerageAccountType,
} from "@/lib/accounts";

export const metadata: Metadata = { title: "Trade - R U Trading" };

type Props = {
  searchParams: Promise<{ account?: string; ticker?: string }>;
};

export default async function TradePage({ searchParams }: Props) {
  const { account: accountParam, ticker: tickerParam } = await searchParams;
  const members = await getAccounts();

  const accounts: TradeAccount[] = filterBrokerageMembers(members).map((m) => ({
    id: m.tradingAccount.id,
    name: m.tradingAccount.name,
    type: m.tradingAccount.type as BrokerageAccountType,
    isJoint: m.tradingAccount.isJoint,
    balance: m.tradingAccount.balance,
    reservedBalance: m.tradingAccount.reservedBalance,
  }));

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyMedia>
            <Wallet className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No trading accounts yet</EmptyTitle>
          <EmptyDescription>
            You need at least one trading account before you can place orders.
          </EmptyDescription>
          <Button variant="outline" render={<Link href="/onboarding" />}>
            Go to onboarding
          </Button>
        </Empty>
      </div>
    );
  }

  // Validate against the user's actual accounts so a stale or shared link
  // (?account=<id>) doesn't quietly leave the picker empty when the id is
  // out-of-scope. Mirrors the holdings/orders pages' validation pattern.
  const requestedAccountId = accountParam
    ? Number(accountParam) || undefined
    : undefined;
  const allAccountIds = accounts.map((a) => a.id);
  const initialAccountId =
    requestedAccountId && allAccountIds.includes(requestedAccountId)
      ? requestedAccountId
      : undefined;
  const initialTicker = tickerParam
    ? tickerParam.toUpperCase()
    : undefined;

  if (!initialAccountId) {
    return (
      <div className="space-y-6">
        <PageHeader divider={false} className="h-auto px-0 pb-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Trade</h1>
            <p className="text-sm text-muted-foreground">
              Select an account from the sidebar before placing an order.
            </p>
          </div>
        </PageHeader>
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyMedia>
              <Wallet className="size-6 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>Select an account</EmptyTitle>
            <EmptyDescription>
              Choose a trading account from the sidebar to continue.
            </EmptyDescription>
          </Empty>
        </div>
      </div>
    );
  }

  const { holdings } = await getAllHoldings(accounts.map((a) => a.id));
  const holdingsByAccount: Record<number, Record<string, string>> = {};
  for (const h of holdings) {
    holdingsByAccount[h.trading_account_id] ??= {};
    // Sellable = quantity − reserved_quantity (shares already locked by open sells).
    const available = Math.max(
      0,
      parseFloat(h.quantity) - parseFloat(h.reserved_quantity),
    );
    holdingsByAccount[h.trading_account_id][h.ticker] = available.toString();
  }

  return (
    <TradeForm
      accounts={accounts}
      initialAccountId={initialAccountId}
      initialTicker={initialTicker}
      marketOpen={isUSMarketOpen()}
      holdingsByAccount={holdingsByAccount}
    />
  );
}
