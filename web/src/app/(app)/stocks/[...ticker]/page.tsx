import type { Metadata } from "next";
import { StockHeader } from "@/components/stocks/stock-header";
import { StockChart } from "@/components/StockChart";
import { KeyStatistics } from "@/components/stocks/key-statistics";
import { OrderForm } from "@/components/stocks/order-form";
import { OrderBook } from "@/components/stocks/order-book";
import { STOCKS } from "@/components/stocks/stock-data";

type Props = { params: Promise<{ ticker: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = ticker.join("/").toUpperCase();
  const stock = STOCKS[symbol];
  return { title: `${stock?.name ?? symbol} (${symbol}) - R U Trading` };
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const symbol = ticker.join("/").toUpperCase();
  const stock = STOCKS[symbol] ?? {
    name: symbol, price: 0, change: 0, open: 0, high: 0, low: 0, prevClose: 0,
    volume: "—", marketCap: "—", pe: 0, week52High: 0, week52Low: 0, avgVolume: "—",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <StockHeader ticker={symbol} stock={stock} />
        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Price Chart</h2>
          <div className="rounded-xl bg-card p-4">
            <StockChart ticker={symbol} />
          </div>
        </div>
        <KeyStatistics stock={stock} />
      </div>
      <div className="space-y-6">
        <OrderForm ticker={symbol} price={stock.price} />
        <OrderBook price={stock.price} />
      </div>
    </div>
  );
}
