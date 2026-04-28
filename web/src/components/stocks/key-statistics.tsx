import type { StockInfo } from "./stock-data";
import { fmtPrice } from "@/lib/format";

const fmtVolume = (n: number): string => {
  if (n <= 0) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString("en-US");
};

export const KeyStatistics = ({
  stock,
  ticker,
  assetClass,
}: {
  stock: StockInfo;
  ticker: string;
  assetClass: "us_equity" | "crypto";
}) => {
  // Crypto daily-bar volume is in base-coin units (e.g. 1.5 BTC), not shares.
  const volumeLabel =
    assetClass === "crypto" ? `Volume (${ticker.split("/")[0]})` : "Volume";

  const stats = [
    { label: "Open", value: `$${fmtPrice(stock.open)}` },
    { label: "High", value: `$${fmtPrice(stock.high)}` },
    { label: "Low", value: `$${fmtPrice(stock.low)}` },
    { label: "Prev Close", value: `$${fmtPrice(stock.prevClose)}` },
    { label: volumeLabel, value: fmtVolume(stock.volume) },
  ];

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Key Statistics</h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-5">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`bg-card px-4 py-3 ${i === 4 ? "col-span-2 md:col-span-1" : ""}`}
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-medium tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
