import { Receipt } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
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
import { SideChip } from "@/components/kalshi/badges";
import type { KalshiFill } from "@/app/actions/kalshi";

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

function fillPrice(f: KalshiFill): string {
  const price = f.yes_price_dollars ?? f.no_price_dollars;
  return price ? `$${price}` : "—";
}

export function KalshiFillsTable({ fills }: { fills: KalshiFill[] }) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Recent Fills</h2>
      {fills.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Receipt className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No fills yet</EmptyTitle>
          <EmptyDescription>
            Executed contracts will appear here once the bot trades.
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Liquidity</TableHead>
              <TableHead>Kalshi ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fills.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{TIME_FMT.format(new Date(f.executed_at))}</TableCell>
                <TableCell className="font-mono text-xs">{f.market_ticker}</TableCell>
                <TableCell>
                  <SideChip side={f.side} />
                </TableCell>
                <TableCell className="capitalize">{f.action}</TableCell>
                <TableCell className="tabular-nums">{f.count_fp}</TableCell>
                <TableCell className="tabular-nums">{fillPrice(f)}</TableCell>
                <TableCell className="tabular-nums">${f.fee_dollars}</TableCell>
                <TableCell>
                  {f.is_taker === null ? (
                    "—"
                  ) : (
                    <Badge variant="default" appearance="soft">
                      {f.is_taker ? "Taker" : "Maker"}
                    </Badge>
                  )}
                </TableCell>
                <TableCell
                  className="font-mono text-xs text-muted-foreground"
                  title={f.kalshi_order_id ?? undefined}
                >
                  {shortKalshiId(f.kalshi_order_id)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
