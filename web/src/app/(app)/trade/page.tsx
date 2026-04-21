import type { Metadata } from "next";
import Link from "next/link";

import { getAccounts } from "@/app/actions/auth";
import { getAllHoldings } from "@/app/actions/portfolio";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Wallet } from "@phosphor-icons/react/ssr";
import { TradeForm, type TradeAccount } from "@/components/trade/trade-form";
import { isUSMarketOpen } from "@/lib/market-hours";

export const metadata: Metadata = { title: "Trade - R U Trading" };

type Props = {
  searchParams: Promise<{ account?: string; ticker?: string }>;
};

export default async function TradePage({ searchParams }: Props) {
  const { account: accountParam, ticker: tickerParam } = await searchParams;
  const members = await getAccounts();

  const accounts: TradeAccount[] = members.map((m) => ({
    id: m.tradingAccount.id,
    name: m.tradingAccount.name,
    type: m.tradingAccount.type,
    isJoint: m.tradingAccount.isJoint,
    balance: m.tradingAccount.balance,
    reservedBalance: m.tradingAccount.reservedBalance,
  }));

  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>No trading accounts yet</EmptyTitle>
            <EmptyDescription>
              You need at least one trading account before you can place
              orders. Create one in onboarding or settings.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" render={<Link href="/onboarding" />}>
            Go to onboarding
          </Button>
        </Empty>
      </div>
    );
  }

  const initialAccountId = accountParam
    ? Number(accountParam) || undefined
    : undefined;
  const initialTicker = tickerParam
    ? tickerParam.toUpperCase()
    : undefined;

  const { holdings } = await getAllHoldings(accounts.map((a) => a.id));
  const holdingsByAccount: Record<number, Record<string, string>> = {};
  for (const h of holdings) {
    holdingsByAccount[h.trading_account_id] ??= {};
    // Effective sellable qty = quantity - reserved_quantity (already open sells).
    // Backend doesn't expose reserved_quantity in the Holding payload today, so
    // we default to full quantity and let the backend reject overages.
    holdingsByAccount[h.trading_account_id][h.ticker] = h.quantity;
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
