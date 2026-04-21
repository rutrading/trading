import Link from "next/link";
import { Briefcase } from "@phosphor-icons/react/ssr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import type { HoldingRow } from "@/app/actions/portfolio";

import { fmtPrice as fmt } from "@/lib/format";

export const HoldingsTable = ({
  holdings,
  accountsById,
}: {
  holdings: HoldingRow[];
  accountsById?: Record<number, { name: string; type: "investment" | "crypto" }>;
}) => {
  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
            <EmptyTitle>No holdings</EmptyTitle>
            <EmptyDescription>Place a trade to see your positions here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Holdings</h2>
      <div className="rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              {accountsById && <TableHead>Account</TableHead>}
              <TableHead>Asset Class</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.map((h) => {
              const qty = parseFloat(h.quantity);
              const avgCost = parseFloat(h.average_cost);
              const totalCost = qty * avgCost;
              return (
                <TableRow key={`${h.trading_account_id}-${h.id}`}>
                  <TableCell>
                    <Link
                      href={`/stocks/${h.ticker}`}
                      className="font-medium hover:underline"
                    >
                      {h.ticker}
                    </Link>
                  </TableCell>
                  {accountsById && (
                    <TableCell className="whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        <span className="text-sm">
                          {accountsById[h.trading_account_id]?.name ?? `#${h.trading_account_id}`}
                        </span>
                        <Badge
                          variant={
                            accountsById[h.trading_account_id]?.type === "crypto"
                              ? "warning"
                              : "secondary"
                          }
                          size="sm"
                        >
                          {accountsById[h.trading_account_id]?.type === "crypto"
                            ? "Crypto"
                            : "Stock"}
                        </Badge>
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {h.asset_class === "crypto" ? "Crypto" : "US Equity"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(avgCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(totalCost)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
