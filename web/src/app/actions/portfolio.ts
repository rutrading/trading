"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";
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
