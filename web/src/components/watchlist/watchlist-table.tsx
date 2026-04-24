"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, X, Star, Binoculars } from "@phosphor-icons/react";
import { toastManager } from "@/components/ui/toast";
import { removeFromWatchlist, type WatchlistItem } from "@/app/actions/watchlist";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuotes } from "@/components/ws-provider";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
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

export const WatchlistTable = ({ items }: { items: WatchlistItem[] }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tickers = useMemo(() => items.map((w) => w.ticker), [items]);
  const liveQuotes = useQuotes(tickers);
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

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Binoculars /></EmptyMedia>
            <EmptyTitle>No stocks tracked</EmptyTitle>
            <EmptyDescription>Search for stocks to add them to your watchlist.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="overflow-hidden rounded-xl bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Symbol</th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Change</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Bid</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Ask</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((w) => {
              // Prefer live WS ticks; fall back to the server-rendered snapshot.
              const live = liveQuotes.get(w.ticker);
              const price = live?.price ?? w.quote?.price;
              const change = live?.change_percent ?? w.quote?.change_percent;
              const bid = live?.bid_price ?? w.quote?.bid_price ?? null;
              const ask = live?.ask_price ?? w.quote?.ask_price ?? null;
              return (
                <tr
                  key={w.ticker}
                  className="group border-b border-border last:border-0 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link href={`/stocks/${w.ticker}`} className="inline-flex items-center gap-2">
                      <Star size={14} weight="fill" className="shrink-0 text-amber-400" />
                      <span className="text-sm font-semibold leading-none">{w.ticker}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium tabular-nums">
                      {price != null ? `$${fmt(price)}` : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {change != null ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-sm font-medium tabular-nums ${
                          change >= 0 ? "text-emerald-500" : "text-red-500"
                        }`}
                      >
                        {change >= 0 ? (
                          <ArrowUp size={12} weight="bold" />
                        ) : (
                          <ArrowDown size={12} weight="bold" />
                        )}
                        {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-right md:table-cell">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {bid != null ? `$${fmt(bid)}` : "—"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right md:table-cell">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {ask != null ? `$${fmt(ask)}` : "—"}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemove(w.ticker)}
                      disabled={removingTickers.has(w.ticker)}
                      aria-label={`Remove ${w.ticker} from watchlist`}
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
