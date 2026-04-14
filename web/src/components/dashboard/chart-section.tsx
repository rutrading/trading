"use client";

import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

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

export const ChartSection = () => {
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
};
