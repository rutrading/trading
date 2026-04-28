"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist } from "@/app/actions/watchlist";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function WatchlistButton({ ticker, initialWatched }: { ticker: string; initialWatched: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [watched, setWatched] = useState(initialWatched);
  const inFlightRef = useRef(false);

  // Resync when the parent server component re-renders with a new value
  // (e.g. after router.refresh post-mutation).
  useEffect(() => {
    setWatched(initialWatched);
  }, [initialWatched]);

  const handleToggle = () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const next = !watched;
    setWatched(next);
    startTransition(async () => {
      try {
        const res = next ? await addToWatchlist(ticker) : await removeFromWatchlist(ticker);
        if (!res.ok) {
          setWatched(!next);
          toastManager.add({ title: `Failed to update watchlist`, type: "error" });
        }
      } catch {
        setWatched(!next);
        toastManager.add({ title: `Failed to update watchlist`, type: "error" });
      } finally {
        inFlightRef.current = false;
      }
    });
  };

  return (
    <Button
      variant={watched ? "warning" : "outline"}
      onClick={handleToggle}
      aria-busy={isPending}
      className={cn(
        "overflow-hidden rounded-xl transition-[transform,filter,box-shadow,background-color] sm:rounded-lg",
        isPending && "brightness-95",
      )}
    >
      <Star
        size={16}
        weight={watched ? "fill" : "regular"}
        className={cn(
          "transition-[color,transform] duration-200 ease-out",
          watched
            ? "scale-110 text-current drop-shadow-[0_0_6px_color-mix(in_srgb,var(--color-amber-300)_80%,transparent)]"
            : "scale-100",
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
