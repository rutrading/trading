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
import { mergeQuote, type Quote } from "@/lib/quote";
import { toIsoStart, toIsoEnd } from "@/components/iso-helper";

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

// Normalize a timestamp to the start of the current interval based on the timeframe
// Mirrors what the backend uses (PostgreSQL date_trunc) so the dates are aligned
function normalizeToIntervalStart(
  nowMs: number,
  tf: TimeframeValue,
): UTCTimestamp {
  const d = new Date(nowMs);

  switch (tf) {
    case "1Min": {
      return (Math.floor(nowMs / (60 * 1000)) * 60) as UTCTimestamp;
    }
    case "5Min": {
      return (Math.floor(nowMs / (5 * 60 * 1000)) * (5 * 60)) as UTCTimestamp;
    }
    case "15Min": {
      return (Math.floor(nowMs / (15 * 60 * 1000)) * (15 * 60)) as UTCTimestamp;
    }
    case "30Min": {
      return (Math.floor(nowMs / (30 * 60 * 1000)) * (30 * 60)) as UTCTimestamp;
    }
    case "1Hour": {
      return (Math.floor(nowMs / (60 * 60 * 1000)) * (60 * 60)) as UTCTimestamp;
    }
    case "1Day": {
      return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) /
        1000) as UTCTimestamp;
    }
    case "1Week": {
      const day = d.getUTCDay();
      const daysToMonday = day === 0 ? 6 : day - 1;
      return (Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate() - daysToMonday,
      ) / 1000) as UTCTimestamp;
    }
    case "1Month": {
      return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) /
        1000) as UTCTimestamp;
    }
    case "3Month": {
      const quarterMonth = Math.floor(d.getUTCMonth() / 3) * 3;
      return (Date.UTC(d.getUTCFullYear(), quarterMonth, 1) /
        1000) as UTCTimestamp;
    }
    case "6Month": {
      const halfMonth = Math.floor(d.getUTCMonth() / 6) * 6;
      return (Date.UTC(d.getUTCFullYear(), halfMonth, 1) /
        1000) as UTCTimestamp;
    }
    case "1Year": {
      return (Date.UTC(d.getUTCFullYear(), 0, 1) / 1000) as UTCTimestamp;
    }
    default: {
      return (Math.floor(nowMs / (15 * 60 * 1000)) * (15 * 60)) as UTCTimestamp;
    }
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
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 2);
    case "1Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 10);
    case "3Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 10);
    case "6Month":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 10);
    case "1Year":
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 365 * 10);
    default:
      return new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 30);
  }
}

// TODO: Auto-update chart when user goes back in time
// TODO: Change zoom when interval changes
export function StockChart({
  ticker,
  initialQuote,
}: {
  ticker: string;
  initialQuote: Quote | null;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const [bars, setBars] = useState<HistoricalBar[]>([]);
  const [timeframe, setTimeframe] = useState<TimeframeValue>("15Min");
  const currentCandleRef = useRef<CandlestickData | null>(null);

  // Falling back to the page-load REST snapshot lets the in-progress
  // candle render at the same price the header shows from the very
  // first paint, instead of pinning to the last historical bar's close
  // (which on longer timeframes can be hours stale) until the WS feed
  // pushes its first trade tick.
  const quote = mergeQuote(initialQuote, useQuote(ticker));

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
    fetchBars();
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
    if (!seriesRef.current) return;
    // Quote ticks (bid/ask updates) don't carry a last-trade price, so they
    // shouldn't move the candle. Skip until a trade tick lands.
    if (quote.price == null) return;

    // match selected timeframe; fall back to wall-clock if the snapshot
    // came in without a timestamp (defensive — the backend always sets
    // one, but `MergedQuote` types it as nullable).
    const tsRaw = quote.timestamp ?? Math.floor(Date.now() / 1000);
    const rawMs =
      typeof tsRaw === "string"
        ? new Date(tsRaw).getTime()
        : Number(tsRaw) > 1e10
          ? Number(tsRaw)
          : Number(tsRaw) * 1000;

    const intervalTime = normalizeToIntervalStart(rawMs, timeframe);

    if (!currentCandleRef.current) {
      const previousHistorical = bars.at(-1);
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
    } else if (
      (currentCandleRef.current.time as number) < (intervalTime as number)
    ) {
      // New candle
      const openPrice = currentCandleRef.current.close ?? quote.price;
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

    const lastBar = bars.at(-1);
    if (
      lastBar &&
      (currentCandleRef.current.time as number) < (lastBar.time as number)
    ) {
      console.warn(
        "Trying to update a candle older than historical data. currentCandleRef.current.time: ",
        currentCandleRef.current.time,
        "lastBar.time: ",
        lastBar.time,
      );
      return; // don't try to update a candle older than historical data
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
