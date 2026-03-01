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

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TimeframeOption = {
  label: string;
  value: "1Min" | "30Min" | "1Hour" | "1Day" | "1Month";
};

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { label: "1 MIN", value: "1Min" },
  { label: "30 MIN", value: "30Min" },
  { label: "1 HOUR", value: "1Hour" },
  { label: "1DAY", value: "1Day" },
  { label: "1MONTH", value: "1Month" },
];

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

export function HistoricalCandlestick() {
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState<TimeframeOption["value"] | "">("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [bars, setBars] = useState<HistoricalBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);

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

  async function handleSubmit() {
    setError("");

    if (!symbol.trim() || !timeframe || !startDate || !endDate) {
      setError("Ticker, timeframe, start date, and end date are required.");
      return;
    }
    if (startDate > endDate) {
      setError("Start date must be before end date.");
      return;
    }

    setLoading(true);
    try {
      const apiBase =
        process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8000/api";
      const response = await fetch(`${apiBase}/historical-bars`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: symbol.trim().toUpperCase(),
          timeframe,
          start: toIsoStart(startDate),
          end: toIsoEnd(endDate),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to fetch historical data");
      }

      const payload = await response.json();
      setBars(payload.bars ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setBars([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Historical_Candlestick</CardTitle>
            <CardDescription>
              Select symbol, timeframe, and date range to load Alpaca historical
              bars.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ticker Symbol</label>
                <Input
                  placeholder="AAPL"
                  value={symbol}
                  onChange={(event) =>
                    setSymbol(event.target.value.toUpperCase())
                  }
                  maxLength={16}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger className="w-full rounded-lg border border-input px-3 py-2 text-left text-sm">
                    {formatDate(startDate)}
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      mode="single"
                      selected={startDate as unknown as never}
                      onSelect={setStartDate as unknown as never}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger className="w-full rounded-lg border border-input px-3 py-2 text-left text-sm">
                    {formatDate(endDate)}
                  </PopoverTrigger>
                  <PopoverContent>
                    <Calendar
                      mode="single"
                      selected={endDate as unknown as never}
                      onSelect={setEndDate as unknown as never}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Timeframe</label>
                <div className="flex flex-wrap gap-2">
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={
                        timeframe === option.value ? "default" : "outline"
                      }
                      onClick={() => setTimeframe(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Loading..." : "Load Historical Data"}
              </Button>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div ref={chartContainerRef} className="h-[520px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
