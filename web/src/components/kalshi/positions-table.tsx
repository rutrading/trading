import { Briefcase } from "@phosphor-icons/react/ssr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { KalshiPosition } from "@/app/actions/kalshi";

function pnlClass(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

export function KalshiPositionsTable({
  positions,
}: {
  positions: KalshiPosition[];
}) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Positions</h2>
      {positions.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Briefcase className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No positions</EmptyTitle>
          <EmptyDescription>
            Open contracts on Kalshi will show here once the bot fills an order.
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Market</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Traded</TableHead>
              <TableHead>Exposure</TableHead>
              <TableHead>Realized P/L</TableHead>
              <TableHead>Fees</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p) => (
              <TableRow key={p.market_ticker}>
                <TableCell className="font-mono text-xs">{p.market_ticker}</TableCell>
                <TableCell className="tabular-nums">{p.position_fp}</TableCell>
                <TableCell className="tabular-nums">
                  ${p.total_traded_dollars}
                </TableCell>
                <TableCell className="tabular-nums">
                  ${p.market_exposure_dollars}
                </TableCell>
                <TableCell
                  className={`tabular-nums ${pnlClass(p.realized_pnl_dollars)}`}
                >
                  ${p.realized_pnl_dollars}
                </TableCell>
                <TableCell className="tabular-nums">${p.fees_paid_dollars}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
