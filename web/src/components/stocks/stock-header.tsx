import { ArrowUp, ArrowDown } from "@phosphor-icons/react/ssr";
import { WatchlistButton } from "./watchlist-button";
import type { StockInfo } from "./stock-data";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const StockHeader = ({ ticker, stock, watched }: { ticker: string; stock: StockInfo; watched: boolean }) => {
  const isPositive = stock.change >= 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded bg-foreground/10 px-2 py-1 text-sm font-semibold">
            {ticker}
          </span>
          <WatchlistButton ticker={ticker} initialWatched={watched} />
        </div>
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{stock.name}</h1>
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold tabular-nums">${fmt(stock.price)}</span>
        <span
          className={`flex items-center gap-1 text-lg font-semibold tabular-nums ${
            isPositive ? "text-emerald-500" : "text-red-500"
          }`}
        >
          {isPositive ? <ArrowUp size={16} weight="bold" /> : <ArrowDown size={16} weight="bold" />}
          {isPositive ? "+" : ""}{stock.change}%
        </span>
      </div>
    </div>
  );
};
