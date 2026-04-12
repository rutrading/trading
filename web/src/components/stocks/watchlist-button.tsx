"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/app/actions/watchlist";
import { toastManager } from "@/components/ui/toast";

export function WatchlistButton({ ticker, initialWatched }: { ticker: string; initialWatched: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [watched, setOptimisticWatched] = useOptimistic(initialWatched);

  const handleToggle = () => {
    startTransition(async () => {
      setOptimisticWatched(!watched);
      const res = watched
        ? await removeFromWatchlist(ticker)
        : await addToWatchlist(ticker);

      if (!res.ok) {
        setOptimisticWatched(watched);
        toastManager.add({ title: `Failed to update watchlist`, type: "error" });
      }
    });
  };

  return (
    <Button variant="outline" onClick={handleToggle} disabled={isPending}>
      <Star size={16} weight={watched ? "fill" : "regular"} className={watched ? "text-amber-400" : ""} />
      {watched ? "Watching" : "Add to Watchlist"}
    </Button>
  );
}
