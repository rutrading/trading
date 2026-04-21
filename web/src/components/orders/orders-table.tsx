import Link from "next/link";
import { Receipt } from "@phosphor-icons/react/ssr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { OrderStatusBadge } from "./order-status-badge";
import type { Order } from "@/app/actions/orders";

import { fmtPrice as fmt } from "@/lib/format";

function priceCell(order: Order) {
  if (order.order_type === "market") return "Market";
  const price = order.limit_price ?? order.stop_price;
  return price ? `$${fmt(parseFloat(price))}` : "—";
}

export const OrdersTable = ({
  orders,
  accountsById,
  page,
  perPage,
  total,
  scopedAccountId,
}: {
  orders: Order[];
  accountsById?: Record<number, { name: string; type: "investment" | "crypto" }>;
  page: number;
  perPage: number;
  total: number;
  scopedAccountId?: number;
}) => {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>No orders yet</EmptyTitle>
            <EmptyDescription>
              Place a buy or sell order from any stock page and it will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pageHref = (p: number) =>
    scopedAccountId
      ? `/orders?account=${scopedAccountId}&page=${p}`
      : `/orders?page=${p}`;

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placed</TableHead>
              {accountsById && <TableHead>Account</TableHead>}
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Avg Fill</TableHead>
              <TableHead>TIF</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(o.created_at).toLocaleString()}
                </TableCell>
                {accountsById && (
                  <TableCell className="whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">
                        {accountsById[o.trading_account_id]?.name ?? `#${o.trading_account_id}`}
                      </span>
                      <Badge
                        variant={
                          accountsById[o.trading_account_id]?.type === "crypto"
                            ? "warning"
                            : "secondary"
                        }
                        size="sm"
                      >
                        {accountsById[o.trading_account_id]?.type === "crypto"
                          ? "Crypto"
                          : "Stock"}
                      </Badge>
                    </span>
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <Link
                    href={`/stocks/${o.ticker}`}
                    className="hover:underline"
                  >
                    {o.ticker}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={o.side === "buy" ? "success" : "error"}
                    size="sm"
                  >
                    {o.side.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="capitalize">
                  {o.order_type.replace("_", " ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {parseFloat(o.filled_quantity)}/{parseFloat(o.quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {priceCell(o)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {o.average_fill_price
                    ? `$${fmt(parseFloat(o.average_fill_price))}`
                    : "—"}
                </TableCell>
                <TableCell className="uppercase text-xs text-muted-foreground">
                  {o.time_in_force}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={o.status} />
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
