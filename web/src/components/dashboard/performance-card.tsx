import Link from "next/link";
import {
  ArrowUpRight,
  ArrowDownRight,
  CaretRight,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { fmtSigned, fmtSignedPct, tone } from "@/lib/format";
import type { WatchlistItem } from "@/app/actions/watchlist";
import { WatchlistRow } from "./watchlist-row";

const Stat = ({
  label,
  amount,
  pct,
}: {
  label: string;
  amount: number;
  pct: number;
}) => (
  <div className="flex flex-col gap-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="flex items-baseline gap-2">
      <span className={cn("text-xl font-semibold tabular-nums", tone(amount))}>
        {fmtSigned(amount)}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-sm tabular-nums",
          tone(amount),
        )}
      >
        {amount > 0 ? (
          <ArrowUpRight size={14} weight="bold" />
        ) : amount < 0 ? (
          <ArrowDownRight size={14} weight="bold" />
        ) : null}
        {fmtSignedPct(pct)}
      </span>
    </div>
  </div>
);

export const PerformanceCard = ({
  todayGain,
  todayGainPct,
  totalGain,
  totalGainPct,
  watchlist = [],
}: {
  todayGain: number;
  todayGainPct: number;
  totalGain: number;
  totalGainPct: number;
  watchlist?: WatchlistItem[];
}) => (
  <div className="rounded-2xl bg-accent p-6">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Performance</h2>
    </div>
    <div className="grid gap-6 rounded-xl bg-card p-4 sm:grid-cols-2">
      <Stat label="Today's Gain/Loss" amount={todayGain} pct={todayGainPct} />
      <Stat label="Total Gain/Loss" amount={totalGain} pct={totalGainPct} />
    </div>
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Watchlist</p>
        <Link
          href="/watchlist"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          See all <CaretRight size={12} />
        </Link>
      </div>
      {watchlist.length > 0 ? (
        <ul className="space-y-2">
          {watchlist.slice(0, 3).map((item) => (
            <li key={item.ticker}>
              <WatchlistRow item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-card px-4 py-3 text-sm text-muted-foreground">
          No assets being tracked
        </p>
      )}
    </div>
  </div>
);
