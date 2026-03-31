"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

export function StockChart({ ticker }: { ticker: string }) {
  // TODO: Set up functionality to change intervals

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const [bars, setBars] = useState<HistoricalBar[]>([]);

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
      // const startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000); // a week ago
      const startDate = new Date(
        new Date().getTime() - 2 * 24 * 60 * 60 * 1000,
      ); // two days ago
      const endDate = new Date(); // current date

      const result = await getHistoricalBars({
        ticker: ticker.trim().toUpperCase(),
        timeframe: "15Min",
        start: toIsoStart(startDate),
        end: toIsoEnd(endDate),
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      setBars(result.data.bars);
    }
    fetchBars();
  }, [ticker]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 520,
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
    chart.timeScale().fitContent();
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
    chart.timeScale().fitContent();
  }, [chartData]);

  const currentCandleRef = useRef<CandlestickData | null>(null);

  useEffect(() => {
    if (!quote || !seriesRef.current) return;

    const intervalSec = 60 * 15; // 15 minute interval in seconds
    const intervalTime = (Math.floor(quote.timestamp / intervalSec) *
      intervalSec) as UTCTimestamp;

    if (currentCandleRef.current === null) {
      // Initialize first candle
      // TODO: use previous candle from historical to prevent completely replacing old candle
      currentCandleRef.current = {
        time: intervalTime,
        open: quote.price,
        high: quote.price,
        low: quote.price,
        close: quote.price,
      };
      seriesRef.current.update(currentCandleRef.current);
      return;
    }

    const currentTime = currentCandleRef.current.time as number;

    if (currentTime === intervalTime) {
      // Same candle
      currentCandleRef.current.close = quote.price;
      currentCandleRef.current.high = Math.max(
        currentCandleRef.current.high,
        quote.price,
      );
      currentCandleRef.current.low = Math.min(
        currentCandleRef.current.low,
        quote.price,
      );
      seriesRef.current.update(currentCandleRef.current);
    } else if (currentTime < intervalTime) {
      // New candle interval
      currentCandleRef.current = {
        time: intervalTime,
        open: quote.price,
        high: quote.price,
        low: quote.price,
        close: quote.price,
      };
      seriesRef.current.update(currentCandleRef.current);
    }
  }, [quote]);

  return (
    <div
      ref={chartContainerRef}
      style={{ width: "100%", height: "400px" }}
    ></div>
  );
}
