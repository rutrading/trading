"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/app/actions/watchlist";
import { toastManager } from "@/components/ui/toast";

export function WatchlistButton({ ticker, initialWatched }: { ticker: string; initialWatched: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [watched, setWatched] = useState(initialWatched);

  // Resync when the parent server component re-renders with a new value
  // (e.g. after router.refresh post-mutation).
  useEffect(() => {
    setWatched(initialWatched);
  }, [initialWatched]);

  const handleToggle = () => {
    const next = !watched;
    setWatched(next);
    startTransition(async () => {
      const res = next ? await addToWatchlist(ticker) : await removeFromWatchlist(ticker);
      if (res.ok) {
        router.refresh();
      } else {
        setWatched(!next);
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
