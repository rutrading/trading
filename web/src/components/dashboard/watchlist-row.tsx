"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { fmtPrice, fmtSignedPct, tone } from "@/lib/format";
import { removeFromWatchlist, type WatchlistItem } from "@/app/actions/watchlist";
import { toastManager } from "@/components/ui/toast";
import { useQuote } from "@/components/ws-provider";
import { mergeQuote } from "@/lib/quote";

export const WatchlistRow = ({ item }: { item: WatchlistItem }) => {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const { price, change_percent: changePct } = mergeQuote(item.quote, useQuote(item.ticker));

  const handleRemove = async () => {
    if (removing) return;
    setRemoving(true);
    const res = await removeFromWatchlist(item.ticker);
    if (res.ok) {
      toastManager.add({ title: `${item.ticker} removed from watchlist`, type: "success" });
      router.refresh();
    } else {
      toastManager.add({ title: `Failed to remove ${item.ticker}`, type: "error" });
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 transition-colors hover:bg-card/80">
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        aria-label={`Remove ${item.ticker} from watchlist`}
        className="rounded-sm text-amber-400 transition-opacity hover:opacity-70 disabled:opacity-50"
      >
        <Star size={14} weight="fill" className="shrink-0" />
      </button>
      <Link href={`/stocks/${item.ticker}`} className="flex flex-1 items-center justify-between">
        <span className="font-medium">{item.ticker}</span>
        <div className="flex items-baseline gap-3 tabular-nums">
          <span className="text-sm">{price != null ? `$${fmtPrice(price)}` : "—"}</span>
          <span className={cn("text-xs", tone(changePct))}>
            {changePct != null ? fmtSignedPct(changePct) : "—"}
          </span>
        </div>
      </Link>
    </div>
  );
};
