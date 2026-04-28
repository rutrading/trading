"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/app/actions/watchlist";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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
    if (isPending) return;
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
    <Button
      variant={watched ? "secondary" : "outline"}
      onClick={handleToggle}
      aria-busy={isPending}
      className={cn(
        "overflow-hidden rounded-xl transition-[transform,filter] sm:rounded-lg",
        isPending && "pointer-events-none brightness-95",
      )}
    >
      <Star
        size={16}
        weight={watched ? "fill" : "regular"}
        className={cn(
          "transition-[color,transform] duration-200 ease-out",
          watched ? "scale-110 text-amber-400" : "scale-100",
          isPending && "animate-pulse",
        )}
      />
      <span className="transition-opacity duration-150 sm:hidden">
        {watched ? "Watching" : "Watch"}
      </span>
      <span className="hidden transition-opacity duration-150 sm:inline">
        {watched ? "Watching" : "Add to Watchlist"}
      </span>
    </Button>
  );
}
