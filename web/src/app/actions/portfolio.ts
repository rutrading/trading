"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";
import { getHistoricalBars } from "@/app/actions/bars";
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

// Aggregate per-ticker daily bars into a single portfolio-value timeline.
// Unions every ticker's bar dates and forward-fills each ticker's last
// known close on dates it has no bar of its own — so weekends and NYSE
// holidays still reflect each stock's prior close instead of contributing
// zero. Without this, a mixed stock+crypto portfolio "halves" every
// Saturday and Sunday because equities have no weekend bars but crypto
// does, and the summed map only carries crypto on those dates. Dates
// earlier than a ticker's first observed bar use that first close as a
// backfill, consistent with the current-quantity-throughout simplification
// documented on the callers below.
type PortfolioSeries = { qty: number; bars: { time: number; close: number }[] };

function aggregatePortfolioBars(
  series: PortfolioSeries[],
  totalCash: number,
): PortfolioPoint[] {
  const ordered = series
    .filter((s) => s.qty > 0 && s.bars.length > 0)
    .map((s) => ({ qty: s.qty, bars: [...s.bars].sort((a, b) => a.time - b.time) }));
  if (ordered.length === 0) return [];

  const allTimes = new Set<number>();
  for (const s of ordered) for (const b of s.bars) allTimes.add(b.time);
  const sortedTimes = [...allTimes].sort((a, b) => a - b);

  const valueByTime = new Map<number, number>();
  for (const s of ordered) {
    let i = 0;
    let lastClose = s.bars[0].close;
    for (const time of sortedTimes) {
      while (i < s.bars.length && s.bars[i].time <= time) {
        lastClose = s.bars[i].close;
        i += 1;
      }
      valueByTime.set(time, (valueByTime.get(time) ?? 0) + s.qty * lastClose);
    }
  }

  return sortedTimes.map((time) => ({
    time,
    value: (valueByTime.get(time) ?? 0) + totalCash,
  }));
}

// Approximation of portfolio value over time. For each unique held ticker
// we pull `days` of daily closes and feed them through the forward-fill
// aggregator above, then add the user's *current* cash balance. Caveats
// baked in:
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

  const series = barResults.flatMap((res, i) =>
    res.ok
      ? [{ qty: qtyByTicker.get(tickers[i]) ?? 0, bars: res.data.bars }]
      : [],
  );
  return aggregatePortfolioBars(series, totalCash);
}

// Bars-only refetch used by the dashboard's portfolio chart when the user
// switches period (1W / 1M / 3M / 1Y). Takes the per-ticker quantities and
// cash that the chart already received as server-rendered props — no need
// to refetch holdings or live quotes, both of which were identical the
// moment the dashboard rendered. The synthetic "now" point is appended
// client-side from `liveValue` (also already in scope).
export async function refreshPortfolioBars(
  tickerQuantities: Record<string, string>,
  totalCash: number,
  days: number,
): Promise<PortfolioPoint[]> {
  const session = await getSession();
  if (!session) return [];

  const tickers = Object.keys(tickerQuantities);
  if (tickers.length === 0) return [];

  const start = new Date(Date.now() - days * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const barResults = await Promise.all(
    tickers.map((ticker) =>
      getHistoricalBars({ ticker, timeframe: "1Day", start }),
    ),
  );

  const series = barResults.flatMap((res, i) => {
    if (!res.ok) return [];
    const qty = parseFloat(tickerQuantities[tickers[i]]);
    return qty > 0 ? [{ qty, bars: res.data.bars }] : [];
  });
  return aggregatePortfolioBars(series, totalCash);
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
