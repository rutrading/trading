"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

export type OrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

export type Order = {
  id: number;
  trading_account_id: number;
  ticker: string;
  asset_class: "us_equity" | "crypto";
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "opg" | "cls";
  quantity: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_quantity: string;
  average_fill_price: string | null;
  status: OrderStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type OrdersPageResponse = {
  orders: Order[];
  total: number;
  page: number;
  per_page: number;
};

export async function getOrders(
  tradingAccountId: number,
  opts?: {
    page?: number;
    perPage?: number;
    status?: OrderStatus;
    ticker?: string;
  },
): Promise<api.ApiResult<OrdersPageResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.get<OrdersPageResponse>("/orders", {
    trading_account_id: tradingAccountId.toString(),
    page: (opts?.page ?? 1).toString(),
    per_page: (opts?.perPage ?? 25).toString(),
    status: opts?.status,
    ticker: opts?.ticker,
  });
}

export async function cancelOrder(
  orderId: number,
): Promise<api.ApiResult<Order>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.post<Order>(`/orders/${orderId}/cancel`);
}
