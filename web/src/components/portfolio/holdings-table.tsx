"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Briefcase } from "@phosphor-icons/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { useQuotes } from "@/components/ws-provider";
import type { HoldingRow } from "@/app/actions/portfolio";
import { cn } from "@/lib/utils";
import {
  fmtPrice as fmt,
  fmtSigned,
  fmtSignedPct,
  fmtUsd,
  tone as colorClass,
} from "@/lib/format";

type RowStats = {
  holding: HoldingRow;
  price: number | null;
  change: number | null; // per-share today's change
  currentValue: number;
  todayGain: number;
  totalGain: number;
  costBasisTotal: number;
};

export type InitialQuote = { price: number | null; change: number | null };

export const HoldingsTable = ({
  holdings,
  totalCash,
  initialQuotes,
}: {
  holdings: HoldingRow[];
  totalCash: number;
  // Server-fetched REST snapshot keyed by ticker. Backstops the WS feed:
  // Alpaca SIP only ticks during regular hours, so without this the table
  // shows "—" everywhere after the close. Crypto behaves the same way until
  // the WS feed has actually pushed at least one tick — REST gives an
  // immediate seed.
  initialQuotes?: Record<string, InitialQuote>;
}) => {
  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const liveQuotes = useQuotes(tickers);

  if (holdings.length === 0 && totalCash === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
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

  // Build per-row stats. WS quote wins if present; otherwise the REST seed
  // from `initialQuotes` carries us through after-hours / pre-WS-tick
  // gaps; final fallback is the holding's `average_cost`.
  const rows: RowStats[] = holdings.map((h) => {
    const qty = parseFloat(h.quantity);
    const avg = parseFloat(h.average_cost);
    const costBasisTotal = qty * avg;
    const live = liveQuotes.get(h.ticker);
    const seed = initialQuotes?.[h.ticker];
    const price = live?.price ?? seed?.price ?? null;
    const change = live?.change ?? seed?.change ?? null;
    const currentValue = price != null ? price * qty : costBasisTotal;
    const todayGain = change != null ? change * qty : 0;
    const totalGain = price != null ? (price - avg) * qty : 0;
    return { holding: h, price, change, currentValue, todayGain, totalGain, costBasisTotal };
  });

  const totalHoldingsValue = rows.reduce((s, r) => s + r.currentValue, 0);
  const totalPortfolioValue = totalHoldingsValue + totalCash;
  const totalTodayGain = rows.reduce((s, r) => s + r.todayGain, 0);
  const totalTotalGain = rows.reduce((s, r) => s + r.totalGain, 0);
  const totalCostBasis = rows.reduce((s, r) => s + r.costBasisTotal, 0);
  const prevClosePortfolio = totalHoldingsValue - totalTodayGain;
  const todayGainPct =
    prevClosePortfolio > 0 ? (totalTodayGain / prevClosePortfolio) * 100 : 0;
  const totalGainPct =
    totalCostBasis > 0 ? (totalTotalGain / totalCostBasis) * 100 : 0;

  const pctOfPortfolio = (value: number) =>
    totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;

  return (
    <div className="rounded-2xl bg-accent p-3">
      <div className="overflow-x-auto rounded-xl bg-card">
        <Table className="[&_th]:h-auto [&_th]:px-2 [&_th]:py-2 [&_th]:text-[11px] [&_th]:leading-tight [&_th]:whitespace-normal [&_th]:align-bottom [&_td]:px-2 [&_td]:py-2 [&_td]:text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Last<br />price</TableHead>
              <TableHead className="text-right">Last price<br />change</TableHead>
              <TableHead className="text-right">Today&apos;s<br />gain/loss</TableHead>
              <TableHead className="text-right">Total<br />gain/loss</TableHead>
              <TableHead className="text-right">Current<br />value</TableHead>
              <TableHead className="text-right">% of<br />account</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg cost<br />basis</TableHead>
              <TableHead className="text-right">Cost basis<br />total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {totalCash > 0 && (
              <TableRow className="border-t-0">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Cash</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Held in money market
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(totalCash)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {pctOfPortfolio(totalCash).toFixed(2)}%
                </TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
              </TableRow>
            )}

            {rows.map((r) => {
              const h = r.holding;
              const qty = parseFloat(h.quantity);
              const avg = parseFloat(h.average_cost);
              const totalGainPctRow =
                r.costBasisTotal > 0 ? (r.totalGain / r.costBasisTotal) * 100 : 0;
              const todayPctRow = r.change != null && r.price != null && r.price !== r.change
                ? (r.change / (r.price - r.change)) * 100
                : 0;

              return (
                <TableRow key={`${h.trading_account_id}-${h.id}`}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        href={`/stocks/${h.ticker}`}
                        className="text-sm font-semibold hover:underline"
                      >
                        {h.ticker}
                      </Link>
                      {h.name && (
                        <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                          {h.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.price != null ? fmtUsd(r.price) : "—"}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", colorClass(r.change))}>
                    {r.change != null ? fmtSigned(r.change) : "—"}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", colorClass(r.todayGain))}>
                    {r.change != null ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span>{fmtSigned(r.todayGain)}</span>
                        <span className="text-[10px]">{fmtSignedPct(todayPctRow)}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", colorClass(r.totalGain))}>
                    {r.price != null ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span>{fmtSigned(r.totalGain)}</span>
                        <span className="text-[10px]">{fmtSignedPct(totalGainPctRow)}</span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtUsd(r.currentValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {pctOfPortfolio(r.currentValue).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{qty}</TableCell>
                  <TableCell className="text-right tabular-nums">${fmt(avg)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtUsd(r.costBasisTotal)}
                  </TableCell>
                </TableRow>
              );
            })}

            {rows.length > 0 && (
              <TableRow className="border-t-2 border-border bg-muted/20 font-medium">
                <TableCell>Account total</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className={cn("text-right tabular-nums", colorClass(totalTodayGain))}>
                  <div className="flex flex-col items-end leading-tight">
                    <span>{fmtSigned(totalTodayGain)}</span>
                    <span className="text-[10px]">{fmtSignedPct(todayGainPct)}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("text-right tabular-nums", colorClass(totalTotalGain))}>
                  <div className="flex flex-col items-end leading-tight">
                    <span>{fmtSigned(totalTotalGain)}</span>
                    <span className="text-[10px]">{fmtSignedPct(totalGainPct)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtUsd(totalPortfolioValue)}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
