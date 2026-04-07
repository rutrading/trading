"use client";

import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

const CHART_POINTS = [
  20, 25, 22, 30, 28, 35, 32, 40, 38, 45, 42, 50, 48, 55, 52, 44, 48, 55, 60,
  58, 65, 62, 68, 72, 70, 75, 72, 78, 82, 80, 85, 82, 78, 82, 88, 85, 90,
];

const RANGES = ["1Min", "5Min", "15Min", "30Min", "1Hour", "1Day", "1Week", "1Month", "3Month"] as const;

const RANGE_LABELS: Record<string, string> = {
  "1Min": "1m",
  "5Min": "5m",
  "15Min": "15m",
  "30Min": "30m",
  "1Hour": "1H",
  "1Day": "1D",
  "1Week": "1W",
  "1Month": "1M",
  "3Month": "3M",
};

function Sparkline() {
  const width = 400;
  const height = 120;
  const maxVal = Math.max(...CHART_POINTS);
  const minVal = Math.min(...CHART_POINTS);
  const range = maxVal - minVal || 1;

  const points = CHART_POINTS.map((v, i) => {
    const x = (i / (CHART_POINTS.length - 1)) * width;
    const y = height - ((v - minVal) / range) * (height - 10) - 5;
    return `${x},${y}`;
  }).join(" ");

  const areaPath = `M0,${height} ${points
    .split(" ")
    .map((p) => `L${p}`)
    .join(" ")} L${width},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#chartGrad)" />
      <polyline
        points={points}
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ChartSection() {
  return (
    <div className="flex items-end gap-4">
      <Tabs defaultValue="1Day">
        <TabsList>
          {RANGES.map((range) => (
            <TabsTab key={range} value={range}>
              {RANGE_LABELS[range]}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
