import Link from "next/link";
import { ArrowUp, ArrowDown } from "@phosphor-icons/react/ssr";

type Holding = {
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  current: number;
  change: number;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const HoldingsList = ({ holdings }: { holdings: Holding[] }) => {
  return (
    <div className="space-y-1">
      {holdings.map((h) => (
        <Link
          key={h.ticker}
          href={`/stocks/${h.ticker}`}
          className="flex items-center justify-between rounded-xl bg-card px-4 py-3 transition-colors hover:bg-card/80"
        >
          <div>
            <p className="text-sm font-medium">{h.ticker}</p>
            <p className="text-xs text-muted-foreground">
              {h.qty} shares @ ${fmt(h.avgCost)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium tabular-nums">
              ${fmt(h.qty * h.current)}
            </p>
            <div className="flex items-center justify-end gap-0.5 text-xs font-medium">
              {h.change >= 0 ? (
                <>
                  <ArrowUp size={10} weight="bold" className="text-emerald-400" />
                  <span className="text-emerald-400">+{h.change}%</span>
                </>
              ) : (
                <>
                  <ArrowDown size={10} weight="bold" className="text-red-400" />
                  <span className="text-red-400">{h.change}%</span>
                </>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};
