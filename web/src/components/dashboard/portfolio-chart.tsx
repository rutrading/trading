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
  refreshPortfolioBars,
} from "@/app/actions/portfolio";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fmtUsd } from "@/lib/format";

// Chart header reads cleaner with whole-dollar amounts; cents add noise next
// to the up/down delta. Local alias to keep call sites short.
const fmtUsdMinor = (n: number) => fmtUsd(n, 0);

// Append a synthetic "now" point to a bar series so the chart's last value
// matches the header's live Portfolio Value. Skipped when the series is
// empty, when `liveValue` isn't trustworthy (signaled by the parent passing
// null when not every ticker has a live price), or when "now" isn't strictly
// after the last bar's timestamp (lightweight-charts rejects duplicates).
function appendLivePoint(
  bars: PortfolioPoint[],
  liveValue: number | null,
): PortfolioPoint[] {
  if (bars.length === 0 || liveValue == null) return bars;
  const nowSec = Math.floor(Date.now() / 1000);
  const lastTime = bars[bars.length - 1].time;
  if (nowSec <= lastTime) return bars;
  return [...bars, { time: nowSec, value: liveValue }];
}

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
  tickerQuantities,
  totalCash,
  liveValue,
  initialDays = 30,
}: {
  data: PortfolioPoint[];
  // Per-ticker quantities, keyed by ticker. Passed to the bars-only refetch
  // on period change so the chart doesn't have to refetch holdings + quotes
  // (the dashboard already loaded them once for its other tiles).
  tickerQuantities: Record<string, string>;
  totalCash: number;
  // Server-computed `marketValue + cash` at render time. Used to append a
  // synthetic "now" point so the chart's last value matches the header's
  // live Portfolio Value instead of lagging at last-close. `null` means at
  // least one ticker was missing a live quote — skip the append rather
  // than silently use cost basis for missing tickers and mislead the trend.
  liveValue: number | null;
  initialDays?: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [days, setDays] = useState<number>(initialDays);
  const [series, setSeries] = useState<PortfolioPoint[]>(data);
  const [pending, startTransition] = useTransition();
  // Reset on account-scope change is handled by a `key` prop at the call
  // site (`<PortfolioChart key={activeIds.join(",")} … />`), which remounts
  // this component and reseats both `days` and `series` from props. Doing it
  // here via a `useEffect(() => setSeries(data), [data])` would also fire on
  // every parent re-render, clobbering the user's just-fetched longer-period
  // data the moment the dashboard hot-reloads anything else.

  // One-time chart construction. Period changes flow through the second
  // effect below as a `setData` + `applyOptions` against the same series ref
  // — without this split, swapping period would tear down and rebuild the
  // chart DOM on every click (visible flash, even with the dim overlay).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const onResize = () => {
      chart.applyOptions({ width: el.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Data + recoloring on every series swap. Cheap — just hands the new
  // points to the existing chart instance and recolors the area in place.
  useEffect(() => {
    const chart = chartRef.current;
    const areaSeries = seriesRef.current;
    if (!chart || !areaSeries) return;

    // Color the area by net direction over the window: green if the latest
    // value is at or above the first, red if below. Matches the rest of the
    // dashboard's red/green semantics.
    const isUp =
      series.length > 0 ? series[series.length - 1].value >= series[0].value : true;
    const lineColor = isUp ? "#10b981" : "#ef4444";
    const topColor = isUp ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)";
    const bottomColor = isUp ? "rgba(16,185,129,0)" : "rgba(239,68,68,0)";

    areaSeries.applyOptions({ lineColor, topColor, bottomColor });
    areaSeries.setData(
      series.map((d) => ({
        // Backend returns Unix seconds; lightweight-charts wants the same.
        time: d.time as UTCTimestamp,
        value: d.value,
      })),
    );
    chart.timeScale().fitContent();
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
      // Bars-only refetch — the chart already has tickerQuantities, cash,
      // and liveValue from server-rendered props, so re-deriving the
      // augmented series client-side avoids the per-ticker /quote and
      // per-account /holdings fan-out the previous shape did on every
      // 1W/1M/3M/1Y click.
      const fresh = await refreshPortfolioBars(
        tickerQuantities,
        totalCash,
        newDays,
      );
      // Empty result means the bars endpoint failed for every ticker. Keep
      // the previous series visible rather than blanking the chart.
      if (fresh.length === 0) return;
      setSeries(appendLivePoint(fresh, liveValue));
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
            <span className="font-medium">{fmtUsdMinor(last)}</span>
            <span className={toneClass}>
              {isUp ? "+" : ""}
              {fmtUsdMinor(delta)} ({isUp ? "+" : ""}
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
