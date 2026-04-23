"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  type PortfolioPoint,
  getAugmentedPortfolioSeries,
} from "@/app/actions/portfolio";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

type Period = { label: string; days: number };

const PERIODS: Period[] = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
];

const periodLabel = (days: number) =>
  PERIODS.find((p) => p.days === days)?.label ?? `${days} days`;

export const PortfolioChart = ({
  data,
  accountIds,
  initialDays = 30,
}: {
  data: PortfolioPoint[];
  accountIds: number[];
  initialDays?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState<number>(initialDays);
  const [series, setSeries] = useState<PortfolioPoint[]>(data);
  const [pending, startTransition] = useTransition();
  // Reset on account-scope change is handled by a `key` prop at the call
  // site (`<PortfolioChart key={activeIds.join(",")} … />`), which remounts
  // this component and reseats both `days` and `series` from props. Doing it
  // here via a `useEffect(() => setSeries(data), [data])` would also fire on
  // every parent re-render, clobbering the user's just-fetched longer-period
  // data the moment the dashboard hot-reloads anything else.

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Color the area by net direction over the window: green if the latest
    // value is at or above the first, red if below. Matches the rest of the
    // dashboard's red/green semantics.
    const isUp =
      series.length > 0 ? series[series.length - 1].value >= series[0].value : true;
    const lineColor = isUp ? "#10b981" : "#ef4444";
    const topColor = isUp ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)";
    const bottomColor = isUp ? "rgba(16,185,129,0)" : "rgba(239,68,68,0)";

    const chart: IChartApi = createChart(el, {
      width: el.clientWidth,
      height: 240,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.6)",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: { vertLine: { labelVisible: false } },
      handleScale: false,
      handleScroll: false,
    });

    const areaSeries: ISeriesApi<"Area"> = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    areaSeries.setData(
      series.map((d) => ({
        // Backend returns Unix seconds; lightweight-charts wants the same.
        time: d.time as UTCTimestamp,
        value: d.value,
      })),
    );
    chart.timeScale().fitContent();

    const onResize = () => {
      chart.applyOptions({ width: el.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [series]);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-accent p-6">
        <h2 className="mb-4 text-lg font-semibold">Portfolio value</h2>
        <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
          Place a trade to start tracking performance.
        </div>
      </div>
    );
  }

  const handlePeriodChange = (newDays: number) => {
    if (newDays === days) return;
    setDays(newDays);
    startTransition(async () => {
      const fresh = await getAugmentedPortfolioSeries(accountIds, newDays);
      // Empty result means the bars endpoint failed for every ticker. Keep
      // the previous series visible rather than blanking the chart.
      if (fresh.length > 0) setSeries(fresh);
    });
  };

  const first = series[0]?.value ?? 0;
  const last = series[series.length - 1]?.value ?? 0;
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const isUp = delta >= 0;
  const toneClass = isUp
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold">
          Portfolio value · {periodLabel(days)}
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-3 text-sm tabular-nums">
            <span className="font-medium">{fmtUsd(last)}</span>
            <span className={toneClass}>
              {isUp ? "+" : ""}
              {fmtUsd(delta)} ({isUp ? "+" : ""}
              {pct.toFixed(2)}%)
            </span>
          </div>
          <Tabs
            value={String(days)}
            onValueChange={(v) => handlePeriodChange(Number(v))}
          >
            <TabsList>
              {PERIODS.map((p) => (
                <TabsTab key={p.days} value={String(p.days)}>
                  {p.label}
                </TabsTab>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>
      <div
        className={cn(
          "rounded-xl bg-card p-2 transition-opacity",
          // Subtle dim while the new period is loading — keeps the existing
          // chart visible (instead of a flash of empty) but signals that the
          // numbers in the header don't yet match the new period.
          pending && "opacity-60",
        )}
      >
        <div ref={containerRef} className="w-full" />
      </div>
    </div>
  );
};
