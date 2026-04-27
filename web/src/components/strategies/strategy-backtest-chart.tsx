"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import { InfoTooltip } from "@/components/ui/info-tooltip";

export type StrategyCurvePoint = {
  time: number;
  equity: string;
  drawdown: string;
};

function useChart(
  containerRef: RefObject<HTMLDivElement | null>,
  data: Array<{ time: number; value: number }>,
  color: string,
  precision = 2,
) {
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: Math.max(el.clientWidth, 1),
      height: 180,
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
      handleScale: false,
      handleScroll: false,
    });

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceFormat: { type: "price", precision, minMove: precision === 0 ? 1 : 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: Math.max(el.clientWidth, 1) });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [containerRef, color, precision]);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;
    seriesRef.current.setData(
      data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );
    chartRef.current.applyOptions({ width: Math.max(containerRef.current?.clientWidth ?? 1, 1) });
    chartRef.current.timeScale().fitContent();
  }, [containerRef, data]);
}

export function StrategyBacktestChart({
  equity,
  drawdown,
}: {
  equity: StrategyCurvePoint[];
  drawdown: StrategyCurvePoint[];
}) {
  const equityRef = useRef<HTMLDivElement>(null);
  const drawdownRef = useRef<HTMLDivElement>(null);

  useChart(
    equityRef,
    equity.map((point) => ({ time: point.time, value: parseFloat(point.equity) })),
    "#10b981",
    2,
  );
  useChart(
    drawdownRef,
    drawdown.map((point) => ({ time: point.time, value: parseFloat(point.drawdown) * 100 })),
    "#ef4444",
    2,
  );

  if (equity.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Run a backtest to see equity and drawdown curves.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-sm font-medium">Equity curve</p>
          <InfoTooltip content="Shows how total account value changed throughout the backtest. Example: a climb from $10,000 to $10,650 means the strategy gained $650 over the test window." />
        </div>
        <div ref={equityRef} className="w-full rounded-xl border bg-card p-2" />
      </div>
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <p className="text-sm font-medium">Drawdown (%)</p>
          <InfoTooltip content="Shows how far the strategy fell from its prior peak. Example: -8% means the account dropped 8% from the highest equity reached before recovering or falling further." />
        </div>
        <div ref={drawdownRef} className="w-full rounded-xl border bg-card p-2" />
      </div>
    </div>
  );
}
