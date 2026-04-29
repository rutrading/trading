import { ListChecks } from "@phosphor-icons/react/ssr";
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
import { OrderStatusBadge, SideChip } from "@/components/kalshi/badges";
import type { KalshiOrder } from "@/app/actions/kalshi";

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  hour12: true,
});

function shortKalshiId(id: string | null): string {
  if (!id) return "—";
  return id.length <= 8 ? id : `…${id.slice(-6)}`;
}

export function KalshiOrdersTable({ orders }: { orders: KalshiOrder[] }) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <ListChecks className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>
            Real submitted orders will appear here once the bot leaves dry-run.
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Filled</TableHead>
              <TableHead>Limit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subaccount</TableHead>
              <TableHead>Kalshi ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{TIME_FMT.format(new Date(o.created_at))}</TableCell>
                <TableCell className="font-mono text-xs">{o.market_ticker}</TableCell>
                <TableCell>
                  <SideChip side={o.side} />
                </TableCell>
                <TableCell className="capitalize">{o.action}</TableCell>
                <TableCell className="tabular-nums">{o.count_fp}</TableCell>
                <TableCell className="tabular-nums">{o.fill_count_fp}</TableCell>
                <TableCell className="tabular-nums">
                  {o.limit_price_dollars ? `$${o.limit_price_dollars}` : "—"}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {o.subaccount_number !== null ? `#${o.subaccount_number}` : "—"}
                </TableCell>
                <TableCell
                  className="font-mono text-xs text-muted-foreground"
                  title={o.kalshi_order_id ?? undefined}
                >
                  {shortKalshiId(o.kalshi_order_id)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
