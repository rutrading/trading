import { ArrowUpRight, ArrowDownRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { fmtSigned, fmtSignedPct, tone } from "@/lib/format";

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
}: {
  todayGain: number;
  todayGainPct: number;
  totalGain: number;
  totalGainPct: number;
}) => (
  <div className="rounded-2xl bg-accent p-6">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-semibold">Performance</h2>
    </div>
    <div className="grid gap-6 rounded-xl bg-card p-4 sm:grid-cols-2">
      <Stat label="Today's Gain/Loss" amount={todayGain} pct={todayGainPct} />
      <Stat label="Total Gain/Loss" amount={totalGain} pct={totalGainPct} />
    </div>
  </div>
);
