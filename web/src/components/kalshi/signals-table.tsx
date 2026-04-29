import { Sparkle } from "@phosphor-icons/react/ssr";
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
import { DecisionBadge, SideChip } from "@/components/kalshi/badges";
import type { KalshiSignal } from "@/app/actions/kalshi";

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  hour12: true,
});

export function KalshiSignalsTable({ signals }: { signals: KalshiSignal[] }) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Recent Signals</h2>
      {signals.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Sparkle className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No signals yet</EmptyTitle>
          <EmptyDescription>
            The bot will record strategy decisions here once it runs a cycle.
          </EmptyDescription>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Limit</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{TIME_FMT.format(new Date(s.created_at))}</TableCell>
                <TableCell className="font-mono text-xs">
                  {s.market_ticker ?? "—"}
                </TableCell>
                <TableCell>{s.strategy}</TableCell>
                <TableCell>
                  <DecisionBadge decision={s.decision} />
                </TableCell>
                <TableCell>{s.side ? <SideChip side={s.side} /> : "—"}</TableCell>
                <TableCell className="tabular-nums">{s.count_fp ?? "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {s.limit_price_dollars ? `$${s.limit_price_dollars}` : "—"}
                </TableCell>
                <TableCell className="max-w-[28ch] truncate text-xs text-muted-foreground">
                  <span title={s.reason ?? undefined}>{s.reason ?? "—"}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
