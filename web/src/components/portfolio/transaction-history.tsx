import { ClockCounterClockwise } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { TransactionRow } from "@/app/actions/portfolio";

import { fmtPrice as fmt } from "@/lib/format";

// Pin locale + timezone so production output is stable regardless of the
// host's $LANG (server component, no hydration concern).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

export const TransactionHistory = ({
  transactions,
  accountsById,
  page,
  perPage,
  total,
  scopedAccountId,
}: {
  transactions: TransactionRow[];
  accountsById?: Record<number, { name: string; type: "investment" | "crypto" }>;
  page: number;
  perPage: number;
  total: number;
  scopedAccountId?: number;
}) => {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyMedia><ClockCounterClockwise className="size-6 text-muted-foreground" /></EmptyMedia>
          <EmptyTitle>No transactions</EmptyTitle>
          <EmptyDescription>Your trade history will appear here.</EmptyDescription>
        </Empty>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageHref = (p: number) =>
    scopedAccountId
      ? `/activity?account=${scopedAccountId}&page=${p}`
      : `/activity?page=${p}`;

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {accountsById && <TableHead>Account</TableHead>}
              <TableHead>Side</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cash Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={`${t.trading_account_id}-${t.id}`}>
                <TableCell className="text-muted-foreground">
                  {DATE_FMT.format(new Date(t.created_at))}
                </TableCell>
                {accountsById && (
                  <TableCell className="whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">
                        {accountsById[t.trading_account_id]?.name ?? `#${t.trading_account_id}`}
                      </span>
                      <Badge
                        variant={
                          accountsById[t.trading_account_id]?.type === "crypto"
                            ? "warning"
                            : "default"
                        }
                      >
                        {accountsById[t.trading_account_id]?.type === "crypto"
                          ? "Crypto"
                          : "Stock"}
                      </Badge>
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  {t.kind === "trade" && t.side ? (
                    <Badge
                      variant={t.side === "buy" ? "success" : "destructive"}
                    >
                      {t.side.toUpperCase()}
                    </Badge>
                  ) : (
                    <Badge
                      variant={t.kind === "withdrawal" ? "destructive" : "default"}
                    >
                      {t.kind.toUpperCase()}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">
                  {t.ticker ? (
                    <Link
                      href={`/stocks/${t.ticker}`}
                      className="hover:underline"
                    >
                      {t.ticker}
                    </Link>
                  ) : t.kind === "trade" ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    "USD"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.quantity
                    ? parseFloat(t.quantity)
                    : t.kind === "trade"
                      ? "—"
                      : <span className="text-muted-foreground">N/A</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.price
                    ? `$${fmt(parseFloat(t.price))}`
                    : t.kind === "trade"
                      ? "—"
                      : <span className="text-muted-foreground">N/A</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${fmt(parseFloat(t.total))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${fmt(parseFloat(t.cash_after))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationContent>
            {hasPrev && (
              <PaginationItem>
                <PaginationPrevious render={<Link href={pageHref(page - 1)} />} />
              </PaginationItem>
            )}
            <PaginationItem>
              <PaginationLink isActive render={<Link href={pageHref(page)} />}>
                {page}
              </PaginationLink>
            </PaginationItem>
            <span className="text-xs text-muted-foreground">
              of {totalPages}
            </span>
            {hasNext && (
              <PaginationItem>
                <PaginationNext render={<Link href={pageHref(page + 1)} />} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};
