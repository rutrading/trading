"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";
import { getHistoricalBars } from "@/app/actions/bars";
import { getQuote } from "@/app/actions/quotes";
import { computeRunningCashWalk } from "@/lib/transactions";

export type Holding = {
  id: number;
  ticker: string;
  name: string | null;
  asset_class: "us_equity" | "crypto";
  quantity: string;
  reserved_quantity: string;
  average_cost: string;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: number;
  kind: "trade" | "deposit" | "withdrawal";
  order_id: number | null;
  ticker: string | null;
  side: "buy" | "sell" | null;
  quantity: string | null;
  price: string | null;
  total: string;
  created_at: string;
};

type HoldingsResponse = {
  holdings: Holding[];
  trading_account_id: number;
  cash_balance: string;
};

type TransactionsResponse = {
  transactions: Transaction[];
  total: number;
  page: number;
  per_page: number;
};

export async function getHoldings(
  tradingAccountId: number,
): Promise<api.ApiResult<HoldingsResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<HoldingsResponse>("/holdings", {
    trading_account_id: tradingAccountId.toString(),
  });
}

export async function getTransactions(
  tradingAccountId: number,
  page = 1,
  ticker?: string,
  perPage = 25,
): Promise<api.ApiResult<TransactionsResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<TransactionsResponse>("/transactions", {
    trading_account_id: tradingAccountId.toString(),
    page: page.toString(),
    per_page: perPage.toString(),
    ticker,
  });
}

export type HoldingRow = Holding & { trading_account_id: number };
export type TransactionRow = Transaction & {
  trading_account_id: number;
  cash_after: string;
};

export type AllHoldings = {
  holdings: HoldingRow[];
  cashByAccount: Record<number, string>;
  totalCash: number;
};

export async function getAllHoldings(
  tradingAccountIds: number[],
): Promise<AllHoldings> {
  const results = await Promise.all(
    tradingAccountIds.map(async (id) => {
      const res = await getHoldings(id);
      return { id, res };
    }),
  );

  const holdings: HoldingRow[] = [];
  const cashByAccount: Record<number, string> = {};
  let totalCash = 0;

  for (const { id, res } of results) {
    if (!res.ok) {
      cashByAccount[id] = "0";
      continue;
    }
    cashByAccount[id] = res.data.cash_balance;
    totalCash += parseFloat(res.data.cash_balance);
    for (const h of res.data.holdings) {
      holdings.push({ ...h, trading_account_id: id });
    }
  }

  return { holdings, cashByAccount, totalCash };
}

export type PortfolioPoint = { time: number; value: number };

// Approximation of portfolio value over time. For each unique held ticker
// we pull `days` of daily closes and sum (qty × close) on each date, then
// add the user's *current* cash balance. Caveats baked in:
//   - Uses CURRENT quantity for every historical date, so a position you
//     opened last week appears as if you've held it the whole window.
//   - Cash is treated as constant — there is no per-date cash snapshot.
// For a paper-trading dashboard those simplifications are fine.
//
// Callers must pass the already-loaded holdings/cash. The dashboard already
// has them on hand — fetching twice would double the per-account /holdings
// requests and contributes to pool exhaustion under fan-out.
export async function getPortfolioTimeSeries(
  holdings: HoldingRow[],
  totalCash: number,
  days = 30,
): Promise<PortfolioPoint[]> {
  const session = await getSession();
  if (!session) return [];
  if (holdings.length === 0) return [];

  // Sum quantity per ticker across all in-scope accounts. The same ticker
  // can legitimately live in two accounts (joint vs individual), and for the
  // chart we only care about the position's total exposure.
  const qtyByTicker = new Map<string, number>();
  for (const h of holdings) {
    const qty = parseFloat(h.quantity);
    if (!(qty > 0)) continue;
    qtyByTicker.set(h.ticker, (qtyByTicker.get(h.ticker) ?? 0) + qty);
  }
  const tickers = [...qtyByTicker.keys()];
  if (tickers.length === 0) return [];

  // ISO date with no time component — `1Day` bars are anchored to the
  // session date and the backend handles timezone alignment.
  const start = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const barResults = await Promise.all(
    tickers.map((ticker) =>
      getHistoricalBars({ ticker, timeframe: "1Day", start }),
    ),
  );

  const valueByTime = new Map<number, number>();
  for (let i = 0; i < tickers.length; i++) {
    const res = barResults[i];
    if (!res.ok) continue;
    const qty = qtyByTicker.get(tickers[i]) ?? 0;
    for (const bar of res.data.bars) {
      valueByTime.set(bar.time, (valueByTime.get(bar.time) ?? 0) + qty * bar.close);
    }
  }

  return [...valueByTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, holdingsValue]) => ({ time, value: holdingsValue + totalCash }));
}

// Full pipeline behind the dashboard's portfolio chart: load holdings + cash,
// fetch historical bars per ticker, fetch live quotes per ticker, then
// append a synthetic "now" point so the chart's last value matches the
// header's live Portfolio Value instead of lagging at last-close. Used
// directly by the client chart to re-render when the user picks a new
// period (1W / 1M / 3M / 1Y) — the dashboard's initial server render
// inlines the same logic to avoid double-fetching what it already needs
// elsewhere on the page.
export async function getAugmentedPortfolioSeries(
  tradingAccountIds: number[],
  days: number,
): Promise<PortfolioPoint[]> {
  const session = await getSession();
  if (!session) return [];
  if (tradingAccountIds.length === 0) return [];

  const { holdings, totalCash } = await getAllHoldings(tradingAccountIds);
  if (holdings.length === 0) return [];

  const uniqueTickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const [bars, quotes] = await Promise.all([
    getPortfolioTimeSeries(holdings, totalCash, days),
    Promise.all(uniqueTickers.map((t) => getQuote(t))),
  ]);

  if (bars.length === 0) return bars;

  const priceByTicker = new Map<string, number>();
  for (let i = 0; i < uniqueTickers.length; i++) {
    const res = quotes[i];
    if (res.ok && res.data.price != null) {
      priceByTicker.set(uniqueTickers[i], res.data.price);
    }
  }

  // Skip the synthetic point unless EVERY ticker has a live price; otherwise
  // we'd silently fall back to cost basis for missing tickers and the
  // appended point would mislead the trend.
  if (!uniqueTickers.every((t) => priceByTicker.has(t))) return bars;

  let liveValue = totalCash;
  for (const h of holdings) {
    const qty = parseFloat(h.quantity);
    const price = priceByTicker.get(h.ticker);
    // Guarded above; assertion keeps TS happy.
    liveValue += qty * (price as number);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const lastTime = bars[bars.length - 1].time;
  if (nowSec <= lastTime) return bars;

  return [...bars, { time: nowSec, value: liveValue }];
}

export async function getAllTransactions(
  tradingAccountIds: number[],
  cashByAccount: Record<number, string>,
  page = 1,
  perPage = 25,
): Promise<{ transactions: TransactionRow[]; total: number; page: number; perPage: number }> {
  // Backend caps per_page at 100. Fetch all pages per account, merge, paginate.
  const BACKEND_MAX = 100;
  const results = await Promise.all(
    tradingAccountIds.map(async (id) => {
      const rows: Transaction[] = [];
      let p = 1;
      while (true) {
        const res = await getTransactions(id, p, undefined, BACKEND_MAX);
        if (!res.ok) break;
        rows.push(...res.data.transactions);
        if (rows.length >= res.data.total || res.data.transactions.length === 0) break;
        p += 1;
        if (p > 100) break;
      }
      return { id, rows };
    }),
  );

  const merged = computeRunningCashWalk(results, cashByAccount);
  const total = merged.length;
  const start = (page - 1) * perPage;
  return {
    transactions: merged.slice(start, start + perPage),
    total,
    page,
    perPage,
  };
}
