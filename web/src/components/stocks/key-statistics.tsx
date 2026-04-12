import type { StockInfo } from "./stock-data";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const KeyStatistics = ({ stock }: { stock: StockInfo }) => {
  const stats = [
    { label: "Open", value: `$${fmt(stock.open)}` },
    { label: "High", value: `$${fmt(stock.high)}` },
    { label: "Low", value: `$${fmt(stock.low)}` },
    { label: "Prev Close", value: `$${fmt(stock.prevClose)}` },
    { label: "Volume", value: stock.volume },
    { label: "Avg Volume", value: stock.avgVolume },
    { label: "Market Cap", value: `$${stock.marketCap}` },
    { label: "P/E Ratio", value: stock.pe.toFixed(1) },
    { label: "52W High", value: `$${fmt(stock.week52High)}` },
    { label: "52W Low", value: `$${fmt(stock.week52Low)}` },
  ];

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Key Statistics</h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-medium tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
