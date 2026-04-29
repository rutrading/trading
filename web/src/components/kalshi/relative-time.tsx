"use client";

import { useSyncExternalStore } from "react";

const ABS_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const subscribeClock = (cb: () => void) => {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
};
const getClient = () => Date.now();
const getServer = () => 0;

function formatRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  if (seconds < 60) return seconds <= 1 ? "just now" : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RelativeTime({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribeClock, getClient, getServer);
  const absolute = ABS_FMT.format(new Date(iso));
  // Server renders absolute time; client immediately hydrates with the relative
  // form, so the text intentionally diverges across SSR/CSR.
  return (
    <time dateTime={iso} title={absolute} suppressHydrationWarning>
      {now === 0 ? absolute : formatRelative(iso, now)}
    </time>
  );
}
