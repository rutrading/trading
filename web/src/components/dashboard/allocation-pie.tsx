// SVG donut chart of portfolio allocation (cash / stocks / crypto). Hand-rolled
// rather than pulling in recharts because we only ever draw three slices and
// the math is trivial: each slice is a circle stroked with the right
// dasharray/offset to advance around the ring.

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

type Slice = {
  label: string;
  value: number;
  color: string; // raw hex; SVG stroke can't take Tailwind tokens
};

const SIZE = 180;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

export const AllocationPie = ({
  cash,
  stocksValue,
  cryptoValue,
}: {
  cash: number;
  stocksValue: number;
  cryptoValue: number;
}) => {
  const slices: Slice[] = [
    // Cash sits visually under the others — neutral grey reads as "not invested"
    { label: "Cash", value: cash, color: "#64748b" },
    { label: "Stocks", value: stocksValue, color: "#10b981" },
    { label: "Crypto", value: cryptoValue, color: "#f59e0b" },
  ].filter((s) => s.value > 0);

  const total = slices.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Allocation</h2>
        <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
          Fund an account to see your allocation.
        </div>
      </div>
    );
  }

  let cumulative = 0;

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Allocation</h2>
      <div className="flex flex-col items-center gap-6 rounded-xl bg-card p-4 sm:flex-row sm:items-center sm:justify-around">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          // Rotate -90deg so the first slice starts at the 12-o'clock position
          // instead of 3-o'clock (SVG's default angle origin).
          style={{ transform: "rotate(-90deg)" }}
          aria-label="Portfolio allocation"
        >
          {/* Track behind the slices makes a single 100% slice still look right
              and adds a subtle outline when slices total < 100%. */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={STROKE}
          />
          {slices.map((slice) => {
            const fraction = slice.value / total;
            const arcLength = fraction * CIRCUMFERENCE;
            const offset = -cumulative;
            cumulative += arcLength;
            return (
              <circle
                key={slice.label}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={slice.color}
                strokeWidth={STROKE}
                strokeDasharray={`${arcLength} ${CIRCUMFERENCE - arcLength}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>

        <div className="flex w-full max-w-[220px] flex-col gap-2 text-sm">
          {slices.map((slice) => {
            const pct = (slice.value / total) * 100;
            return (
              <div key={slice.label} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-foreground">{slice.label}</span>
                </div>
                <div className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-foreground">{fmtUsd(slice.value)}</span>
                  <span className="text-xs text-muted-foreground">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
