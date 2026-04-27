import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockHeader } from "@/components/stocks/stock-header";
import { StockChart } from "@/components/StockChart";
import { KeyStatistics } from "@/components/stocks/key-statistics";
import { OrderForm, type OrderFormAccount } from "@/components/stocks/order-form";
import { CompanyProfileCard } from "@/components/stocks/company-profile";
import { getCompanyProfile, getSymbol } from "@/app/actions/symbols";
import { getAccounts } from "@/app/actions/auth";
import { getQuote } from "@/app/actions/quotes";
import { getWatchlist } from "@/app/actions/watchlist";
import { STOCKS } from "@/components/stocks/stock-data";
import { isUSMarketOpen } from "@/lib/market-hours";
import {
  filterBrokerageMembers,
  type BrokerageAccountType,
} from "@/lib/accounts";

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

  const [dbSymbol, watchlistRes, company, members, quoteRes] = await Promise.all([
    getSymbol(symbol),
    getWatchlist(),
    getCompanyProfile(symbol),
    getAccounts(),
    getQuote(symbol),
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

  const accounts: OrderFormAccount[] = filterBrokerageMembers(members).map((m) => ({
    id: m.tradingAccount.id,
    name: m.tradingAccount.name,
    type: m.tradingAccount.type as BrokerageAccountType,
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
    volume: 0,
  };

  if (dbSymbol && STOCKS[symbol]) {
    stock.name = dbSymbol.name;
  }

  // Overlay the live quote so the header price reflects reality instead of
  // the stale hardcoded `STOCKS` snapshot (and so symbols not in `STOCKS`
  // don't render as $0.00). Backend may omit fields when the upstream
  // quote is partial — fall back to existing values in that case.
  if (quoteRes.ok) {
    const q = quoteRes.data;
    if (q.price != null) stock.price = q.price;
    if (q.previous_close != null) stock.prevClose = q.previous_close;
    if (q.change_percent != null) stock.change = q.change_percent;
    if (q.open != null) stock.open = q.open;
    if (q.high != null) stock.high = q.high;
    if (q.low != null) stock.low = q.low;
    if (q.volume != null) stock.volume = q.volume;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <StockHeader
          ticker={symbol}
          stock={stock}
          initialQuote={quoteRes.ok ? quoteRes.data : null}
          watched={watched}
        />
        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Price Chart</h2>
          <div className="rounded-xl bg-card p-4">
            <StockChart
              ticker={symbol}
              initialQuote={quoteRes.ok ? quoteRes.data : null}
            />
          </div>
        </div>
        <KeyStatistics stock={stock} ticker={symbol} assetClass={assetClass} />
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
