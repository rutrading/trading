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

type HistoricalBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function formatDate(date?: Date): string {
  if (!date) return "Select date";
  return date.toLocaleDateString();
}

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
  // const [startDate, setStartDate] = useState<Date>(new Date());
  // const [endDate, setEndDate] = useState<Date>(new Date());
  // const startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000); // a week ago
  const startDate = new Date(new Date().getTime() - 2 * 24 * 60 * 60 * 1000); // two days ago
  const endDate = new Date(); // current date

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);
  const [bars, setBars] = useState<HistoricalBar[]>([]);

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
      const result = await getHistoricalBars({
        ticker: ticker.trim().toUpperCase(),
        timeframe: "1Min",
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

  // useEffect(() => {
  //   if (chartRef.current && bars.length > 0) {
  //     const candlestickSeries = chartRef.current.addCandlestickSeries();
  //     candlestickSeries.setData(bars);
  //   }
  // }, [bars]);

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

  return (
    <div
      ref={chartContainerRef}
      style={{ width: "100%", height: "400px" }}
    ></div>
  );
}
