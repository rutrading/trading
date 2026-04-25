import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockHeader } from "@/components/stocks/stock-header";
import { StockChart } from "@/components/StockChart";
import { KeyStatistics } from "@/components/stocks/key-statistics";
import { OrderForm, type OrderFormAccount } from "@/components/stocks/order-form";
import { CompanyProfileCard } from "@/components/stocks/company-profile";
import { getCompanyProfile, getSymbol } from "@/app/actions/symbols";
import { getAccounts } from "@/app/actions/auth";
import { getWatchlist } from "@/app/actions/watchlist";
import { STOCKS } from "@/components/stocks/stock-data";
import { isUSMarketOpen } from "@/lib/market-hours";

type Props = { params: Promise<{ ticker: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = ticker.join("/").toUpperCase();
  const dbSymbol = await getSymbol(symbol);
  const name = dbSymbol?.name ?? STOCKS[symbol]?.name ?? symbol;
  return { title: `${name} (${symbol}) - R U Trading` };
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const symbol = ticker.join("/").toUpperCase();

  const [dbSymbol, watchlistRes, company, members] = await Promise.all([
    getSymbol(symbol),
    getWatchlist(),
    getCompanyProfile(symbol),
    getAccounts(),
  ]);
  if (!dbSymbol && !STOCKS[symbol]) notFound();

  const watched = watchlistRes.ok
    ? watchlistRes.data.watchlist.some((w) => w.ticker === symbol)
    : false;

  // The trade form needs to know whether this symbol is a stock or crypto so
  // it can filter the user's accounts down to compatible ones (a crypto
  // account can't buy AAPL and vice versa). Fall back to "us_equity" for
  // demo-only `STOCKS` entries that aren't in the symbol table yet.
  const assetClass: "us_equity" | "crypto" =
    dbSymbol?.assetClass ?? "us_equity";

  const accounts: OrderFormAccount[] = members.map((m) => ({
    id: m.tradingAccount.id,
    name: m.tradingAccount.name,
    type: m.tradingAccount.type,
    balance: m.tradingAccount.balance,
  }));

  const stock = STOCKS[symbol] ?? {
    name: dbSymbol?.name ?? symbol,
    price: 0,
    change: 0,
    open: 0,
    high: 0,
    low: 0,
    prevClose: 0,
    volume: "—",
    marketCap: "—",
    pe: 0,
    week52High: 0,
    week52Low: 0,
    avgVolume: "—",
  };

  if (dbSymbol && STOCKS[symbol]) {
    stock.name = dbSymbol.name;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <StockHeader ticker={symbol} stock={stock} watched={watched} />
        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Price Chart</h2>
          <div className="rounded-xl bg-card p-4">
            <StockChart ticker={symbol} />
          </div>
        </div>
        <KeyStatistics stock={stock} />
      </div>
      <div className="space-y-6">
        <OrderForm
          ticker={symbol}
          price={stock.price}
          assetClass={assetClass}
          accounts={accounts}
          marketOpen={isUSMarketOpen()}
        />
        <CompanyProfileCard ticker={symbol} company={company} />
      </div>
    </div>
  );
}
