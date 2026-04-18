"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type Holding = {
  id: number;
  ticker: string;
  asset_class: "us_equity" | "crypto";
  quantity: string;
  average_cost: string;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: number;
  order_id: number;
  ticker: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
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
