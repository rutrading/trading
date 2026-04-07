"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, Star } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

interface Stock {
  name: string;
  price: number;
  change: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: string;
  marketCap: string;
  pe: number;
  week52High: number;
  week52Low: number;
  avgVolume: string;
}

const TIMEFRAMES = [
  { value: "1Min", label: "1m" },
  { value: "5Min", label: "5m" },
  { value: "15Min", label: "15m" },
  { value: "30Min", label: "30m" },
  { value: "1Hour", label: "1H" },
  { value: "1Day", label: "1D" },
  { value: "1Week", label: "1W" },
  { value: "1Month", label: "1M" },
  { value: "3Month", label: "3M" },
] as const;

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ChartPlaceholder() {
  const points = [
    40, 42, 38, 45, 50, 48, 52, 47, 55, 58, 53, 60, 57, 62, 65, 60, 58, 63,
    68, 72, 70, 67, 74, 78, 75, 80, 76, 82, 85, 80, 78, 83, 88, 85, 82, 87, 90,
  ];
  const w = 600, h = 200;
  const max = Math.max(...points), min = Math.min(...points);
  const range = max - min || 1;

  const polyline = points
    .map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * (h - 20) - 10}`)
    .join(" ");

  const area = `M0,${h} ${polyline.split(" ").map((p) => `L${p}`).join(" ")} L${w},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <defs>
        <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#stockGrad)" className="text-emerald-500" />
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500" />
    </svg>
  );
}

const ORDER_BOOK_ASKS = [
  { price: 179.20, size: 1200, total: "215K" },
  { price: 179.00, size: 850, total: "153K" },
  { price: 178.80, size: 2100, total: "376K" },
  { price: 178.70, size: 450, total: "81K" },
];

const ORDER_BOOK_BIDS = [
  { price: 178.40, size: 1800, total: "321K" },
  { price: 178.20, size: 950, total: "169K" },
  { price: 178.00, size: 3200, total: "570K" },
  { price: 177.80, size: 600, total: "107K" },
];

export function StockDetail({ ticker, stock }: { ticker: string; stock: Stock }) {
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("market");
  const isPositive = stock.change >= 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{stock.name}</h1>
              <span className="rounded bg-foreground/10 px-2 py-1 text-sm font-semibold">
                {ticker}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
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
          <Button variant="outline" size="icon">
            <Star size={18} />
          </Button>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Price Chart</h2>
            <Tabs defaultValue="1Day">
              <TabsList>
                {TIMEFRAMES.map((tf) => (
                  <TabsTab key={tf.value} value={tf.value}>
                    {tf.label}
                  </TabsTab>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="h-[280px] rounded-xl bg-card p-4">
            <ChartPlaceholder />
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Key Statistics</h2>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-4">
            {[
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
            ].map((stat) => (
              <div key={stat.label} className="bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-sm font-medium tabular-nums">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Place Order</h2>
          <div className="space-y-4 rounded-xl bg-card p-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                onClick={() => setOrderSide("buy")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  orderSide === "buy"
                    ? "bg-emerald-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setOrderSide("sell")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  orderSide === "sell"
                    ? "bg-red-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {["market", "limit", "stop"].map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    orderType === type
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="qty" className="text-xs">Quantity</Label>
                <Input id="qty" type="number" placeholder="0" />
              </div>

              {orderType !== "market" && (
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs">
                    {orderType === "limit" ? "Limit Price" : "Stop Price"}
                  </Label>
                  <Input id="price" type="number" placeholder={fmt(stock.price)} />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Price</span>
                <span className="font-medium tabular-nums">${fmt(stock.price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Total</span>
                <span className="font-medium tabular-nums">$0.00</span>
              </div>
            </div>

            <Button
              className="w-full"
              variant={orderSide === "buy" ? "default" : "destructive"}
            >
              {orderSide === "buy" ? "Buy" : "Sell"} {ticker}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Order Book</h2>
          <div className="space-y-1 rounded-xl bg-card p-4">
            <div className="mb-2 grid grid-cols-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>Price</span>
              <span className="text-right">Size</span>
              <span className="text-right">Total</span>
            </div>

            {ORDER_BOOK_ASKS.slice().reverse().map((row, i) => (
              <div key={`ask-${i}`} className="grid grid-cols-3 py-0.5 text-xs tabular-nums">
                <span className="text-red-500">${fmt(row.price)}</span>
                <span className="text-right text-muted-foreground">{row.size.toLocaleString()}</span>
                <span className="text-right text-muted-foreground">{row.total}</span>
              </div>
            ))}

            <div className="my-2 flex items-center justify-center gap-2 rounded-md bg-muted py-1.5 text-xs font-semibold tabular-nums">
              ${fmt(stock.price)}
              <span className="text-[10px] text-muted-foreground">LAST PRICE</span>
            </div>

            {ORDER_BOOK_BIDS.map((row, i) => (
              <div key={`bid-${i}`} className="grid grid-cols-3 py-0.5 text-xs tabular-nums">
                <span className="text-emerald-500">${fmt(row.price)}</span>
                <span className="text-right text-muted-foreground">{row.size.toLocaleString()}</span>
                <span className="text-right text-muted-foreground">{row.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
