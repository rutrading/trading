"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { CaretRight, Receipt } from "@phosphor-icons/react";
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
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "./order-status-badge";
import type { Order } from "@/app/actions/orders";

import { fmtPrice as fmt } from "@/lib/format";

function priceCell(order: Order) {
  if (order.order_type === "market") {
    if (order.reference_price) return `$${fmt(parseFloat(order.reference_price))}`;
    return "Market";
  }
  const price = order.limit_price ?? order.stop_price;
  return price ? `$${fmt(parseFloat(price))}` : "—";
}

function totalCell(order: Order) {
  const avg = order.average_fill_price ? parseFloat(order.average_fill_price) : null;
  const filled = parseFloat(order.filled_quantity);
  if (avg == null || !filled) return "—";
  return `$${fmt(avg * filled)}`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  // Column count drives the detail row's colSpan. Mirror the <th> structure below.
  const colCount = 1 /* chevron */ + 1 /* date */ + (accountsById ? 1 : 0) +
    1 /* symbol */ + 1 /* side */ + 1 /* type */ + 1 /* filled */ + 1 /* remaining */ +
    1 /* price */ + 1 /* avg */ + 1 /* total */ + 1 /* tif */ + 1 /* status */;

  return (
    <div className="rounded-2xl bg-accent p-3">
      <div className="overflow-x-auto rounded-xl bg-card">
        <Table className="[&_th]:h-auto [&_th]:px-2 [&_th]:py-2 [&_th]:text-[11px] [&_th]:leading-tight [&_th]:whitespace-normal [&_th]:align-bottom [&_td]:px-2 [&_td]:py-2 [&_td]:text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-6" />
              <TableHead>Date</TableHead>
              {accountsById && <TableHead>Account</TableHead>}
              <TableHead>Symbol</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity<br />Filled</TableHead>
              <TableHead className="text-right">Quantity<br />Remaining</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Avg Fill<br />Price</TableHead>
              <TableHead className="text-right">Total $</TableHead>
              <TableHead>TIF</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => {
              const expanded = expandedIds.has(o.id);
              const filled = parseFloat(o.filled_quantity);
              const remaining = parseFloat(o.quantity) - filled;
              return (
                <Fragment key={o.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => toggleRow(o.id)}
                  >
                    <TableCell className="w-8 pl-3 pr-0">
                      <CaretRight
                        size={14}
                        className={cn(
                          "text-muted-foreground transition-transform",
                          expanded && "rotate-90",
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString()}
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
                        onClick={(e) => e.stopPropagation()}
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
                      {filled}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {remaining}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {priceCell(o)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.average_fill_price
                        ? `$${fmt(parseFloat(o.average_fill_price))}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalCell(o)}
                    </TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">
                      {o.time_in_force}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={colCount} className="py-3">
                        <div className="flex flex-wrap gap-x-8 gap-y-1 px-2 text-xs">
                          <span>
                            <span className="text-muted-foreground">Order placed: </span>
                            <span className="tabular-nums">{fmtDateTime(o.created_at)}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Order executed: </span>
                            <span className="tabular-nums">
                              {o.last_fill_at ? fmtDateTime(o.last_fill_at) : "Not executed"}
                            </span>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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
