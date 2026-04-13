"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type CandlestickData,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { ArrowsOut, ArrowsIn } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

const TIMEFRAMES = [
  { value: "1Min", label: "1m" },
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "1Hour", label: "1H" },
  { value: "1Day", label: "1D" },
  { value: "1Week", label: "1W" },
  { value: "1Month", label: "1M" },
] as const;

function generateMockCandles(count: number): CandlestickData[] {
  const candles: CandlestickData[] = [];
  let price = 150 + Math.random() * 50;
  const now = Math.floor(Date.now() / 1000);

  for (let i = count; i > 0; i--) {
    const time = (now - i * 86400) as UTCTimestamp;
    const open = price;
    const volatility = price * 0.03;
    const close = open + (Math.random() - 0.48) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    candles.push({ time, open, high, low, close });
    price = close;
  }

  return candles;
}

export function CandlestickChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeframe, setTimeframe] = useState("1Day");

  const chartColors = {
    up: "#16a34a",
    down: "#dc2626",
    bg: "transparent",
    gridLines: "rgba(255, 255, 255, 0.04)",
    border: "rgba(255, 255, 255, 0.08)",
    text: "rgba(255, 255, 255, 0.5)",
    crosshair: "rgba(255, 255, 255, 0.2)",
  };

  const buildChart = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: chartColors.bg },
        textColor: chartColors.text,
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: chartColors.gridLines },
        horzLines: { color: chartColors.gridLines },
      },
      rightPriceScale: {
        borderColor: chartColors.border,
      },
      timeScale: {
        borderColor: chartColors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: chartColors.crosshair, labelBackgroundColor: "#1a1a1a" },
        horzLine: { color: chartColors.crosshair, labelBackgroundColor: "#1a1a1a" },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: chartColors.up,
      downColor: chartColors.down,
      borderVisible: false,
      wickUpColor: chartColors.up,
      wickDownColor: chartColors.down,
    });

    series.setData(generateMockCandles(200));
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) chart.applyOptions({ width, height });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [timeframe]);

  useEffect(() => {
    const cleanup = buildChart();
    return cleanup;
  }, [buildChart]);

  const toggleFullscreen = useCallback(() => {
    const wrapper = containerRef.current?.parentElement;
    if (!wrapper) return;

    if (!document.fullscreenElement) {
      wrapper.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="mb-3 flex items-center justify-between">
        <Tabs
          value={timeframe}
          onValueChange={setTimeframe}
        >
          <TabsList>
            {TIMEFRAMES.map((tf) => (
              <TabsTab key={tf.value} value={tf.value}>
                {tf.label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen}>
          {isFullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl bg-card">
        <div
          ref={containerRef}
          className={isFullscreen ? "h-screen w-full" : "h-[400px] w-full"}
        />
      </div>
    </div>
  );
}
