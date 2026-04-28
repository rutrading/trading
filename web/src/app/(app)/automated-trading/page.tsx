import type { Metadata } from "next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/ui/page";
import { Robot } from "@phosphor-icons/react/ssr";
import { AutomatedTradingClient } from "@/components/strategies/automated-trading-client";
import { loadAutomatedTradingData } from "./load-data";

export const metadata: Metadata = {
  title: "Automated Trading - R U Trading",
};

type Props = {
  searchParams: Promise<{ account?: string }>;
};

export default async function AutomatedTradingPage({ searchParams }: Props) {
  const { account } = await searchParams;
  const data = await loadAutomatedTradingData(account);

  if (data.accounts.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Robot />
            </EmptyMedia>
            <EmptyTitle>No investment accounts</EmptyTitle>
            <EmptyDescription>
              Open an investment account before enabling automated trading.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!data.initialAccountId) {
    return (
      <div className="space-y-6">
        <PageHeader divider={false} className="h-auto px-0 pb-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Automated Trading</h1>
            <p className="text-sm text-muted-foreground">
              Select an account from the sidebar before managing strategies.
            </p>
          </div>
        </PageHeader>
        <div className="rounded-2xl bg-accent p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Robot />
              </EmptyMedia>
              <EmptyTitle>Select an account</EmptyTitle>
              <EmptyDescription>
                Choose an investment account from the sidebar to continue.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  return <AutomatedTradingClient {...data} defaultSection="overview" />;
}
