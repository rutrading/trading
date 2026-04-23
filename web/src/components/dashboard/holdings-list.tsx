import Link from "next/link";
import { Briefcase } from "@phosphor-icons/react/ssr";
import type { HoldingRow } from "@/app/actions/portfolio";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { fmtSigned, fmtUsd, tone } from "@/lib/format";

export const HoldingsList = ({
  holdings,
  accountsById,
  // Server-fetched live prices keyed by ticker. When provided, the row
  // displays market value (qty × current price) instead of cost basis so the
  // dashboard's sort key (current value) matches what the user sees. Without
  // it, falls back to cost basis (shape used by older callers).
  priceByTicker,
  changeByTicker,
}: {
  holdings: HoldingRow[];
  accountsById?: Record<number, { name: string }>;
  priceByTicker?: Map<string, number>;
  changeByTicker?: Map<string, number>;
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
        const livePrice = priceByTicker?.get(h.ticker);
        const liveChange = changeByTicker?.get(h.ticker);
        const marketValue = livePrice != null ? qty * livePrice : qty * avgCost;
        const todayGain =
          livePrice != null && liveChange != null ? qty * liveChange : null;
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
                {qty} shares @ {fmtUsd(avgCost)}
                {accountName ? ` · ${accountName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium tabular-nums">{fmtUsd(marketValue)}</p>
              <p className={`text-xs tabular-nums ${tone(todayGain)}`}>
                {todayGain != null
                  ? `${fmtSigned(todayGain)} today`
                  : h.asset_class === "crypto"
                    ? "Crypto"
                    : "Equity"}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
};
