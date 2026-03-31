"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type CandlestickData,
  type UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { getHistoricalBars } from "@/app/actions/bars";
import { useQuote } from "@/components/ws-provider";

type HistoricalBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type TimeframeValue =
  | "1Min"
  | "5Min"
  | "15Min"
  | "30Min"
  | "1Hour"
  | "1Day"
  | "1Week"
  | "1Month"
  | "3Month"
  | "6Month"
  | "1Year";

type TimeframeOption = {
  label: string;
  value: TimeframeValue;
};

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: "1 MIN", value: "1Min" },
  { label: "5 MIN", value: "5Min" },
  { label: "15 MIN", value: "15Min" },
  { label: "30 MIN", value: "30Min" },
  { label: "1 HOUR", value: "1Hour" },
  { label: "1 DAY", value: "1Day" },
  { label: "1 WEEK", value: "1Week" },
  { label: "1 MONTH", value: "1Month" },
  { label: "3 MONTH", value: "3Month" },
  { label: "6 MONTH", value: "6Month" },
  { label: "1 YEAR", value: "1Year" },
];

function toIsoStart(date: Date): string {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
    ),
  ).toISOString();
}

function toIsoEnd(date: Date): string {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
    ),
  ).toISOString();
}

function timeframeToSeconds(tf: TimeframeValue) {
  switch (tf) {
    case "1Min":
      return 60;
    case "5Min":
      return 60 * 5;
    case "15Min":
      return 60 * 15;
    case "30Min":
      return 60 * 30;
    case "1Hour":
      return 60 * 60;
    case "1Day":
      return 60 * 60 * 24;
    case "1Week":
      return 60 * 60 * 24 * 7;
    case "1Month":
      return 60 * 60 * 24 * 30;
    case "3Month":
      return 60 * 60 * 24 * 30 * 3;
    case "6Month":
      return 60 * 60 * 24 * 30 * 6;
    case "1Year":
      return 60 * 60 * 24 * 365;
    default:
      return 60 * 15; // 15 mins
  }
}

function timeframeToStartDate(tf: TimeframeValue): Date {
  switch (tf) {
    case "1Min":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 7);
    case "5Min":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 30);
    case "15Min":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 30);
    case "30Min":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 30);
    case "1Hour":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 60);
    case "1Day":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365);
    case "1Week":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365);
    case "1Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365);
    case "3Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 36 * 2);
    case "6Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 4);
    case "1Year":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 10);
    default:
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 30);
  }
}

// TODO: Fix real-time updates on some time ranges
export function StockChart({ ticker }: { ticker: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const [bars, setBars] = useState<HistoricalBar[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeValue>("15Min");
  const currentCandleRef = useRef<CandlestickData | null>(null);

  const quote = useQuote(ticker);

  // TODO: Replace useMemo if possible
  const chartData = useMemo<CandlestickData[]>(() => {
    return bars.map((bar) => ({
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
  }, [bars]);

  useEffect(() => {
    async function fetchBars() {
      const startDate = timeframeToStartDate(timeframe);
      const endDate = new Date(); // current date

      const result = await getHistoricalBars({
        ticker: ticker.trim().toUpperCase(),
        timeframe: timeframe,
        start: toIsoStart(startDate),
        end: toIsoEnd(endDate),
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setBars(result.data.bars);
      currentCandleRef.current = null;
    }
    fetchBars().catch((err) => {
      console.error("Failed to fetch bars:", err);
    });
  }, [ticker, timeframe]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: {
        vertLines: { color: "rgba(120, 120, 120, 0.15)" },
        horzLines: { color: "rgba(120, 120, 120, 0.15)" },
      },
      rightPriceScale: {
        borderColor: "rgba(120, 120, 120, 0.3)",
      },
      timeScale: {
        borderColor: "rgba(120, 120, 120, 0.3)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderVisible: false,
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    });

    candleSeries.setData([]);
    chart.timeScale().applyOptions({
      barSpacing: 10,
      minBarSpacing: 0.5,
    });
    chartRef.current = chart;
    seriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (!width) return;
      chart.applyOptions({ width });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    series.setData(chartData);
    chart.timeScale().applyOptions({
      barSpacing: 10,
      minBarSpacing: 0.5,
    });
  }, [chartData]);

  useEffect(() => {
    if (!quote || !seriesRef.current) return;

    // match selected timeframe
    const intervalSec = timeframeToSeconds(timeframe);
    const intervalTime = (Math.floor(quote.timestamp / intervalSec) *
      intervalSec) as UTCTimestamp;

    if (!currentCandleRef.current) {
      // First candle
      // find the most recent historical bar at or before the intervalTime
      const previousHistorical = bars.findLast((b) => b.time <= intervalTime);

      const openPrice = previousHistorical?.open ?? quote.price;
      const highPrice = previousHistorical?.high ?? quote.price;
      const lowPrice = previousHistorical?.low ?? quote.price;
      currentCandleRef.current = {
        time: intervalTime,
        open: openPrice,
        high: Math.max(openPrice, highPrice),
        low: Math.min(openPrice, lowPrice),
        close: quote.price,
      };
    } else if (currentCandleRef.current.time < (intervalTime as number)) {
      // New candle
      const openPrice = currentCandleRef.current?.close ?? quote.price;
      currentCandleRef.current = {
        time: intervalTime,
        open: openPrice,
        high: Math.max(openPrice, quote.price),
        low: Math.min(openPrice, quote.price),
        close: quote.price,
      };
    } else {
      // Same interval — just update existing candle
      currentCandleRef.current.close = quote.price;
      currentCandleRef.current.high = Math.max(
        currentCandleRef.current.high,
        quote.price,
      );
      currentCandleRef.current.low = Math.min(
        currentCandleRef.current.low,
        quote.price,
      );
    }

    seriesRef.current.update(currentCandleRef.current);
  }, [quote, bars, timeframe]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {TIMEFRAME_OPTIONS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={timeframe === option.value ? "default" : "outline"}
            onClick={() => setTimeframe(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div ref={chartContainerRef} style={{ width: "100%", height: "400px" }} />
    </div>
  );
}
