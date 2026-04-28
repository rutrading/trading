"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, X, Star, Binoculars } from "@phosphor-icons/react";
import { toastManager } from "@/components/ui/toast";
import { removeFromWatchlist, type WatchlistItem } from "@/app/actions/watchlist";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuotes } from "@/components/ws-provider";
import { mergeQuote } from "@/lib/quote";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  DataTable,
  createColumnHelper,
  type DataTableColumnDef,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PER_PAGE = 25;

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const col = createColumnHelper<WatchlistItem>();

export const WatchlistTable = ({
  items,
  qtyByTicker,
}: {
  items: WatchlistItem[];
  qtyByTicker: Record<string, number>;
}) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const liveQuotes = useQuotes(items.map((w) => w.ticker));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = items.slice(
    (clampedPage - 1) * PER_PAGE,
    clampedPage * PER_PAGE,
  );
  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < totalPages;
  const pageHref = (p: number) => `/watchlist?page=${p}`;

  const [removingTickers, setRemovingTickers] = useState<Set<string>>(new Set());

  const handleRemove = async (ticker: string) => {
    if (removingTickers.has(ticker)) return;
    setRemovingTickers((prev) => new Set(prev).add(ticker));
    try {
      const res = await removeFromWatchlist(ticker);
      if (res.ok) {
        toastManager.add({ title: `${ticker} removed from watchlist`, type: "success" });
        router.refresh();
      } else {
        toastManager.add({ title: `Failed to remove ${ticker}`, type: "error" });
      }
    } finally {
      setRemovingTickers((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  };

  const columns: DataTableColumnDef<WatchlistItem>[] = [
    col.accessor("ticker", {
      header: "Symbol",
      size: 180,
      cell: (info) => {
        const ticker = info.getValue();
        return (
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleRemove(ticker)}
              disabled={removingTickers.has(ticker)}
              aria-label={`Remove ${ticker} from watchlist`}
              className="rounded-sm text-amber-400 transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <Star size={14} weight="fill" className="shrink-0" />
            </button>
            <Link
              href={`/stocks/${ticker}`}
              className="text-sm font-semibold leading-none hover:underline"
            >
              {ticker}
            </Link>
          </div>
        );
      },
    }),
    col.display({
      id: "qty",
      header: () => <span className="flex justify-end">Qty Owned</span>,
      size: 110,
      cell: ({ row }) => {
        const qty = qtyByTicker[row.original.ticker] ?? 0;
        return <div className="text-right text-muted-foreground tabular-nums">{qty > 0 ? fmt(qty) : "—"}</div>;
      },
    }),
    col.display({
      id: "value",
      header: () => <span className="flex justify-end">Value Owned</span>,
      size: 130,
      cell: ({ row }) => {
        const q = mergeQuote(row.original.quote, liveQuotes.get(row.original.ticker));
        const qty = qtyByTicker[row.original.ticker] ?? 0;
        const valueOwned = qty > 0 && q.price != null ? qty * q.price : null;
        return <div className="text-right text-muted-foreground tabular-nums">{valueOwned != null ? `$${fmt(valueOwned)}` : "—"}</div>;
      },
    }),
    col.display({
      id: "price",
      header: () => <span className="flex justify-end">Price</span>,
      size: 110,
      cell: ({ row }) => {
        const q = mergeQuote(row.original.quote, liveQuotes.get(row.original.ticker));
        return <div className="text-right font-medium tabular-nums">{q.price != null ? `$${fmt(q.price)}` : "—"}</div>;
      },
    }),
    col.display({
      id: "change",
      header: () => <span className="flex justify-end">Change</span>,
      size: 110,
      cell: ({ row }) => {
        const q = mergeQuote(row.original.quote, liveQuotes.get(row.original.ticker));
        const change = q.change_percent;
        if (change == null) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className={`flex items-center justify-end gap-0.5 font-medium tabular-nums ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {change >= 0 ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </div>
        );
      },
    }),
    col.display({
      id: "bid",
      header: () => <span className="flex justify-end">Bid</span>,
      size: 100,
      cell: ({ row }) => {
        const q = mergeQuote(row.original.quote, liveQuotes.get(row.original.ticker));
        return <div className="text-right text-muted-foreground tabular-nums">{q.bid_price != null ? `$${fmt(q.bid_price)}` : "—"}</div>;
      },
    }),
    col.display({
      id: "ask",
      header: () => <span className="flex justify-end">Ask</span>,
      size: 100,
      cell: ({ row }) => {
        const q = mergeQuote(row.original.quote, liveQuotes.get(row.original.ticker));
        return <div className="text-right text-muted-foreground tabular-nums">{q.ask_price != null ? `$${fmt(q.ask_price)}` : "—"}</div>;
      },
    }),
    col.display({
      id: "remove",
      header: "",
      size: 52,
      enableSorting: false,
      cell: ({ row }) => {
        const ticker = row.original.ticker;
        return (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => handleRemove(ticker)}
              disabled={removingTickers.has(ticker)}
              aria-label={`Remove ${ticker} from watchlist`}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </div>
        );
      },
    }),
  ];

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyMedia><Binoculars className="size-6 text-muted-foreground" /></EmptyMedia>
          <EmptyTitle>No stocks tracked</EmptyTitle>
          <EmptyDescription>Search for stocks to add them to your watchlist.</EmptyDescription>
        </Empty>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-accent p-6">
      <DataTable
        columns={columns}
        data={pageItems}
        density="compact"
        enableColumnResizing
      />
      {totalPages > 1 && (
        <Pagination className="mt-4">
          <PaginationContent>
            {hasPrev && (
              <PaginationItem>
                <PaginationPrevious render={<Link href={pageHref(clampedPage - 1)} />} />
              </PaginationItem>
            )}
            <PaginationItem>
              <PaginationLink isActive render={<Link href={pageHref(clampedPage)} />}>
                {clampedPage}
              </PaginationLink>
            </PaginationItem>
            <span className="text-xs text-muted-foreground">
              of {totalPages}
            </span>
            {hasNext && (
              <PaginationItem>
                <PaginationNext render={<Link href={pageHref(clampedPage + 1)} />} />
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};
