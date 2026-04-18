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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { Transaction } from "@/app/actions/portfolio";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TransactionHistory = ({
  transactions,
  page,
  perPage,
  total,
}: {
  transactions: Transaction[];
  page: number;
  perPage: number;
  total: number;
}) => {
  if (transactions.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Transaction History</h2>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClockCounterClockwise /></EmptyMedia>
            <EmptyTitle>No transactions</EmptyTitle>
            <EmptyDescription>Your trade history will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageHref = (p: number) => `/portfolio?page=${p}`;

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Transaction History</h2>
      <div className="rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={t.side === "buy" ? "success" : "error"}
                    size="sm"
                  >
                    {t.side.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{t.ticker}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {parseFloat(t.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${fmt(parseFloat(t.price))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${fmt(parseFloat(t.total))}
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
