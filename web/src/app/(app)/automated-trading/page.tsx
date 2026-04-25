import type { Metadata } from "next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Robot } from "@phosphor-icons/react/ssr";
import { AutomatedTradingClient } from "@/components/strategies/automated-trading-client";
import { loadAutomatedTradingData } from "./load-data";

export const metadata: Metadata = {
  title: "Automated Trading - R U Trading",
};

export default async function AutomatedTradingPage() {
  const data = await loadAutomatedTradingData();

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

  return <AutomatedTradingClient {...data} defaultSection="overview" />;
}
