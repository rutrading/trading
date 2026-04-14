import type { Metadata } from "next";
import { ArrowUp, ArrowDown } from "@phosphor-icons/react/ssr";
import { Badge } from "@/components/ui/badge";
import { CandlestickChart } from "./_components/candlestick-chart";
import { OrderForm } from "./_components/order-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string[] }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = ticker.join("/");
  return { title: `${symbol.toUpperCase()} - R U Trading` };
}

const MOCK_QUOTE = {
  price: 178.5,
  change: 3.25,
  changePct: 1.85,
  open: 175.2,
  high: 179.8,
  low: 174.9,
  volume: "52.3M",
  prevClose: 175.25,
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ ticker: string[] }>;
}) {
  const { ticker } = await params;
  const symbol = ticker.join("/");
  const q = MOCK_QUOTE;
  const isPositive = q.changePct >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4">
        <h1 className="text-3xl font-bold tracking-tight">
          {symbol.toUpperCase()}
        </h1>
        <span className="text-3xl font-bold tabular-nums">${fmt(q.price)}</span>
        <Badge variant={isPositive ? "success" : "error"} size="lg">
          {isPositive ? (
            <ArrowUp size={14} weight="bold" />
          ) : (
            <ArrowDown size={14} weight="bold" />
          )}
          {isPositive ? "+" : ""}{fmt(q.change)} ({q.changePct}%)
        </Badge>
      </div>

      <div className="flex gap-6 text-sm">
        <div>
          <span className="text-muted-foreground">Open </span>
          <span className="font-medium tabular-nums">${fmt(q.open)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">High </span>
          <span className="font-medium tabular-nums">${fmt(q.high)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Low </span>
          <span className="font-medium tabular-nums">${fmt(q.low)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Prev Close </span>
          <span className="font-medium tabular-nums">${fmt(q.prevClose)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Volume </span>
          <span className="font-medium tabular-nums">{q.volume}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <CandlestickChart ticker={symbol} />
        <OrderForm ticker={symbol} price={q.price} />
      </div>
    </div>
  );
}
