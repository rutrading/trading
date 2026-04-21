import Link from "next/link";
import { Briefcase } from "@phosphor-icons/react/ssr";
import type { HoldingRow } from "@/app/actions/portfolio";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HoldingsList = ({
  holdings,
  accountsById,
}: {
  holdings: HoldingRow[];
  accountsById?: Record<number, { name: string }>;
}) => {
  if (holdings.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
          <EmptyTitle>No holdings yet</EmptyTitle>
          <EmptyDescription>Place a trade to see your positions here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-1">
      {holdings.map((h) => {
        const qty = parseFloat(h.quantity);
        const avgCost = parseFloat(h.average_cost);
        const totalCost = qty * avgCost;
        const accountName = accountsById?.[h.trading_account_id]?.name;
        return (
          <Link
            key={`${h.trading_account_id}-${h.ticker}`}
            href={`/stocks/${h.ticker}`}
            className="flex items-center justify-between rounded-xl bg-card px-4 py-3 transition-colors hover:bg-card/80"
          >
            <div>
              <p className="text-sm font-medium">{h.ticker}</p>
              <p className="text-xs text-muted-foreground">
                {qty} shares @ ${fmt(avgCost)}
                {accountName ? ` · ${accountName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium tabular-nums">${fmt(totalCost)}</p>
              <p className="text-xs text-muted-foreground">{h.asset_class === "crypto" ? "Crypto" : "Equity"}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
};
