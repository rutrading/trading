"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowClockwise, CaretRight, Receipt } from "@phosphor-icons/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "./order-status-badge";
import { cancelOrder, type Order, type OrderStatus } from "@/app/actions/orders";
import type { AccountType } from "@/lib/accounts";

import { fmtPrice as fmt } from "@/lib/format";

const CANCELLABLE: ReadonlySet<OrderStatus> = new Set([
  "pending",
  "open",
  "partially_filled",
]);

// Exported for unit testing — see orders-table.test.tsx.
export function priceCell(order: Order) {
  if (order.order_type === "market") {
    if (order.reference_price) return `$${fmt(parseFloat(order.reference_price))}`;
    return "Market";
  }
  const price = order.limit_price ?? order.stop_price;
  return price ? `$${fmt(parseFloat(price))}` : "—";
}

export function totalCell(order: Order) {
  const avg = order.average_fill_price ? parseFloat(order.average_fill_price) : null;
  const filled = parseFloat(order.filled_quantity);
  if (avg == null || !filled) return "—";
  return `$${fmt(avg * filled)}`;
}

export type FormattedOrderDates = {
  date: string;
  createdAt: string;
  lastFillAt: string | null;
};

export const OrdersTable = ({
  orders,
  accountsById,
  page,
  perPage,
  total,
  scopedAccountId,
  formattedDates,
}: {
  orders: Order[];
  accountsById?: Record<number, { name: string; type: AccountType }>;
  page: number;
  perPage: number;
  total: number;
  scopedAccountId?: number;
  // Pre-formatted on the server so SSR + client agree on the rendered string
  // (Node's ICU locale would otherwise differ from the browser's TZ/locale).
  formattedDates: Record<number, FormattedOrderDates>;
}) => {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const toggleRow = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCancel = (id: number, ticker: string) => {
    if (cancellingId !== null) return;
    setCancellingId(id);
    startTransition(async () => {
      const res = await cancelOrder(id);
      setCancellingId(null);
      if (res.ok) {
        toastManager.add({
          title: `Cancelled ${ticker} order`,
          type: "success",
        });
        router.refresh();
      } else {
        toastManager.add({
          title: `Failed to cancel ${ticker} order`,
          description: res.error,
          type: "error",
        });
      }
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
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`order-${o.id}-detail`}
                        aria-label={
                          expanded
                            ? `Collapse details for order ${o.ticker}`
                            : `Expand details for order ${o.ticker}`
                        }
                        onClick={(e) => {
                          // Row already toggles; stop the bubble so we don't
                          // toggle twice.
                          e.stopPropagation();
                          toggleRow(o.id);
                        }}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <CaretRight
                          size={14}
                          className={cn(
                            "transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formattedDates[o.id]?.date ?? "—"}
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
                      {fmt(filled)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(remaining)}
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
                    <TableRow className="bg-muted/20" id={`order-${o.id}-detail`}>
                      <TableCell colSpan={colCount} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-2 text-xs">
                          <div className="flex flex-wrap gap-x-8 gap-y-1">
                            <span>
                              <span className="text-muted-foreground">Order placed: </span>
                              <span className="tabular-nums">
                                {formattedDates[o.id]?.createdAt ?? "—"}
                              </span>
                            </span>
                            <span>
                              <span className="text-muted-foreground">Order executed: </span>
                              <span className="tabular-nums">
                                {formattedDates[o.id]?.lastFillAt ?? "Not executed"}
                              </span>
                            </span>
                          </div>
                          {CANCELLABLE.has(o.status) && (
                            <Button
                              type="button"
                              variant="destructive-outline"
                              size="sm"
                              disabled={cancellingId === o.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancel(o.id, o.ticker);
                              }}
                              aria-label={`Cancel ${o.ticker} order`}
                              className="h-7 px-3 text-xs"
                            >
                              {cancellingId === o.id && (
                                <ArrowClockwise className="size-3 animate-spin" />
                              )}
                              Cancel order
                            </Button>
                          )}
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
