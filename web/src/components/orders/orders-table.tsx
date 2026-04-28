"use no memo";
"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { CaretRight, Receipt } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import { cancelOrder, type Order, type OrderStatus } from "@/app/actions/orders";
import type { AccountType } from "@/lib/accounts";
import { fmtPrice as fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "./order-status-badge";

const CANCELLABLE: ReadonlySet<OrderStatus> = new Set([
  "pending",
  "open",
  "partially_filled",
]);

const EMPTY_ROW_HEIGHT = 42;
const RESERVED_ROWS = 8;

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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const toggleRow = (id: number) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
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
        toastManager.add({ title: `Cancelled ${ticker} order`, type: "success" });
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

  const columns: ColumnDef<Order>[] = [
    {
      id: "expand",
      header: "",
      size: 34,
      cell: ({ row }) => {
        const order = row.original;
        const expanded = expandedIds.has(order.id);
        return (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`order-${order.id}-detail`}
            aria-label={
              expanded
                ? `Collapse details for order ${order.ticker}`
                : `Expand details for order ${order.ticker}`
            }
            onClick={(event) => {
              event.stopPropagation();
              toggleRow(order.id);
            }}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CaretRight
              size={14}
              className={cn("transition-transform", expanded && "rotate-90")}
            />
          </button>
        );
      },
    },
    {
      id: "date",
      header: "Date",
      size: 104,
      cell: ({ row }) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formattedDates[row.original.id]?.date ?? "—"}
        </span>
      ),
    },
    ...(accountsById
      ? [
          {
            id: "account",
            header: "Account",
            size: 180,
            cell: ({ row }) => {
              const account = accountsById[row.original.trading_account_id];
              return (
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-sm">
                    {account?.name ?? `#${row.original.trading_account_id}`}
                  </span>
                  <Badge variant={account?.type === "crypto" ? "warning" : "default"}>
                    {account?.type === "crypto" ? "Crypto" : "Stock"}
                  </Badge>
                </span>
              );
            },
          } satisfies ColumnDef<Order>,
        ]
      : []),
    {
      accessorKey: "ticker",
      header: "Symbol",
      size: 88,
      cell: ({ row }) => (
        <Link
          href={`/stocks/${row.original.ticker}`}
          onClick={(event) => event.stopPropagation()}
          className="font-medium hover:underline"
        >
          {row.original.ticker}
        </Link>
      ),
    },
    {
      accessorKey: "side",
      header: "Side",
      size: 82,
      cell: ({ row }) => (
        <Badge variant={row.original.side === "buy" ? "success" : "destructive"}>
          {row.original.side.toUpperCase()}
        </Badge>
      ),
    },
    {
      id: "type",
      header: "Type",
      size: 106,
      cell: ({ row }) => (
        <span className="capitalize">{row.original.order_type.replace("_", " ")}</span>
      ),
    },
    {
      id: "filled",
      header: "Qty Filled",
      size: 96,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">
          {fmt(parseFloat(row.original.filled_quantity))}
        </span>
      ),
    },
    {
      id: "remaining",
      header: "Qty Remaining",
      size: 112,
      cell: ({ row }) => {
        const filled = parseFloat(row.original.filled_quantity);
        const remaining = parseFloat(row.original.quantity) - filled;
        return <span className="block text-right tabular-nums">{fmt(remaining)}</span>;
      },
    },
    {
      id: "price",
      header: "Price",
      size: 96,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">{priceCell(row.original)}</span>
      ),
    },
    {
      id: "averageFillPrice",
      header: "Avg Fill",
      size: 104,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">
          {row.original.average_fill_price
            ? `$${fmt(parseFloat(row.original.average_fill_price))}`
            : "—"}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      size: 96,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">{totalCell(row.original)}</span>
      ),
    },
    {
      accessorKey: "time_in_force",
      header: "TIF",
      size: 66,
      cell: ({ row }) => (
        <span className="uppercase text-muted-foreground text-xs">
          {row.original.time_in_force}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 132,
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
    },
  ];

  // This file opts out of React Compiler with "use no memo" for TanStack Table.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: orders,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const colSpan = table.getVisibleLeafColumns().length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const hasRows = rows.length > 0;
  const pageHref = (p: number) =>
    scopedAccountId
      ? `/orders?account=${scopedAccountId}&page=${p}`
      : `/orders?page=${p}`;

  return (
    <div className="rounded-2xl bg-accent p-3">
      <div className="relative overflow-hidden rounded-xl bg-card">
        <ScrollArea scrollbarGutter className="max-h-[560px]">
          <table
            className="w-full text-xs"
            style={{ minWidth: table.getTotalSize() }}
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => {
                    const isLast = index === headerGroup.headers.length - 1;
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "h-10 bg-muted/72 px-2 text-left align-middle font-medium text-muted-foreground text-xs",
                          index === 0 && "rounded-l-lg",
                          isLast && "rounded-r-lg",
                          header.column.id !== "expand" && "whitespace-nowrap",
                        )}
                        style={isLast ? undefined : { width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => {
                const order = row.original;
                const expanded = expandedIds.has(order.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-muted/30"
                      data-state={expanded ? "open" : "closed"}
                      onClick={() => toggleRow(order.id)}
                    >
                      {row.getVisibleCells().map((cell, index) => {
                        const isLast = index === row.getVisibleCells().length - 1;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-2 py-2 align-middle whitespace-nowrap",
                              index === 0 && "rounded-l-lg",
                              isLast && "rounded-r-lg",
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {expanded && (
                      <tr id={`order-${order.id}-detail`} className="bg-muted/20">
                        <td colSpan={colSpan} className="px-2 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 px-2 text-xs">
                            <div className="flex flex-wrap gap-x-8 gap-y-1">
                              <span>
                                <span className="text-muted-foreground">Order placed: </span>
                                <span className="tabular-nums">
                                  {formattedDates[order.id]?.createdAt ?? "—"}
                                </span>
                              </span>
                              <span>
                                <span className="text-muted-foreground">Order executed: </span>
                                <span className="tabular-nums">
                                  {formattedDates[order.id]?.lastFillAt ?? "Not executed"}
                                </span>
                              </span>
                            </div>
                            {CANCELLABLE.has(order.status) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={cancellingId === order.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCancel(order.id, order.ticker);
                                }}
                                aria-label={`Cancel ${order.ticker} order`}
                                className="h-7 px-3 text-destructive text-xs hover:text-destructive"
                              >
                                {cancellingId === order.id && <Spinner className="size-3" />}
                                Cancel order
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!hasRows &&
                Array.from({ length: RESERVED_ROWS }).map((_, index) => (
                  <tr key={`empty-row-${index}`} aria-hidden>
                    <td colSpan={colSpan} style={{ height: EMPTY_ROW_HEIGHT }}>
                      &nbsp;
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </ScrollArea>
        {!hasRows && (
          <div className="pointer-events-none absolute inset-x-0 top-10 flex items-center justify-center py-10">
            <div className="pointer-events-auto">
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
          </div>
        )}
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
            <span className="text-xs text-muted-foreground">of {totalPages}</span>
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
