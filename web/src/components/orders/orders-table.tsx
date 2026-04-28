"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CaretRight, Receipt } from "@phosphor-icons/react";
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toastManager } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
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

type OrdersTableProps = {
  orders: Order[];
  accountsById?: Record<number, { name: string; type: AccountType }>;
  page: number;
  perPage: number;
  total: number;
  scopedAccountId?: number;
  // Pre-formatted on the server so SSR + client agree on the rendered string
  // (Node's ICU locale would otherwise differ from the browser's TZ/locale).
  formattedDates: Record<number, FormattedOrderDates>;
};

type OrderRowsProps = {
  order: Order;
  accountsById?: Record<number, { name: string; type: AccountType }>;
  formattedDates: Record<number, FormattedOrderDates>;
  colCount: number;
  cancellingId: number | null;
  onCancel: (id: number, ticker: string) => void;
};

function OrderRows({
  order: o,
  accountsById,
  formattedDates,
  colCount,
  cancellingId,
  onCancel,
}: OrderRowsProps) {
  const [open, setOpen] = useState(false);
  const filled = parseFloat(o.filled_quantity);
  const remaining = parseFloat(o.quantity) - filled;

  return (
    <Collapsible key={o.id} open={open} onOpenChange={setOpen} render={<tbody />}>
      <TableRow
        className="cursor-pointer hover:bg-muted/30"
        data-state={open ? "open" : "closed"}
        onClick={() => setOpen((current) => !current)}
      >
        <TableCell className="w-8 pl-3 pr-0">
          <CollapsibleTrigger
            type="button"
            aria-label={`Toggle details for order ${o.ticker}`}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-panel-open]_.order-chevron]:rotate-90"
          >
            <CaretRight size={14} className="order-chevron transition-transform" />
          </CollapsibleTrigger>
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
                    : "default"
                }
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
          <Badge variant={o.side === "buy" ? "success" : "destructive"}>
            {o.side.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell className="capitalize">
          {o.order_type.replace("_", " ")}
        </TableCell>
        <TableCell className="text-right tabular-nums">{fmt(filled)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(remaining)}</TableCell>
        <TableCell className="text-right tabular-nums">{priceCell(o)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {o.average_fill_price ? `$${fmt(parseFloat(o.average_fill_price))}` : "—"}
        </TableCell>
        <TableCell className="text-right tabular-nums">{totalCell(o)}</TableCell>
        <TableCell className="uppercase text-xs text-muted-foreground">
          {o.time_in_force}
        </TableCell>
        <TableCell>
          <OrderStatusBadge status={o.status} />
        </TableCell>
      </TableRow>
      <CollapsibleContent
        id={`order-${o.id}-detail`}
        render={<TableRow />}
        className="bg-muted/20"
      >
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
                variant="outline"
                size="sm"
                disabled={cancellingId === o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel(o.id, o.ticker);
                }}
                aria-label={`Cancel ${o.ticker} order`}
                className="h-7 px-3 text-destructive text-xs hover:text-destructive"
              >
                {cancellingId === o.id && <Spinner className="size-3" />}
                Cancel order
              </Button>
            )}
          </div>
        </TableCell>
      </CollapsibleContent>
    </Collapsible>
  );
}

export const OrdersTable = ({
  orders,
  accountsById,
  page,
  perPage,
  total,
  scopedAccountId,
  formattedDates,
}: OrdersTableProps) => {
  const router = useRouter();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

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
          <EmptyMedia>
            <Receipt className="size-6 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>No orders yet</EmptyTitle>
          <EmptyDescription>
            Place a buy or sell order from any stock page and it will appear here.
          </EmptyDescription>
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
          {orders.map((order) => (
            <OrderRows
              key={order.id}
              order={order}
              accountsById={accountsById}
              formattedDates={formattedDates}
              colCount={colCount}
              cancellingId={cancellingId}
              onCancel={handleCancel}
            />
          ))}
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
