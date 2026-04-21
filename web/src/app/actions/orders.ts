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
  reference_price: string | null;
  filled_quantity: string;
  average_fill_price: string | null;
  status: OrderStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  last_fill_at: string | null;
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

export async function getAllOrders(
  tradingAccountIds: number[],
  page = 1,
  perPage = 25,
): Promise<{ orders: Order[]; total: number; page: number; perPage: number }> {
  // Backend caps per_page at 100. Fetch all pages per account, merge, paginate.
  const BACKEND_MAX = 100;
  const results = await Promise.all(
    tradingAccountIds.map(async (id) => {
      const all: Order[] = [];
      let p = 1;
      while (true) {
        const res = await getOrders(id, { page: p, perPage: BACKEND_MAX });
        if (!res.ok) break;
        all.push(...res.data.orders);
        if (all.length >= res.data.total || res.data.orders.length === 0) break;
        p += 1;
        if (p > 100) break; // safety
      }
      return all;
    }),
  );
  const merged = results.flat();
  merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = merged.length;
  const start = (page - 1) * perPage;
  return {
    orders: merged.slice(start, start + perPage),
    total,
    page,
    perPage,
  };
}

export async function cancelOrder(
  orderId: number,
): Promise<api.ApiResult<Order>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.post<Order>(`/orders/${orderId}/cancel`);
}

export type PlaceOrderInput = {
  tradingAccountId: number;
  ticker: string;
  assetClass: "us_equity" | "crypto";
  side: "buy" | "sell";
  orderType: "market" | "limit" | "stop" | "stop_limit";
  timeInForce?: "day" | "gtc" | "opg" | "cls";
  quantity: string;
  limitPrice?: string;
  stopPrice?: string;
};

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<api.ApiResult<Order>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };

  const body: Record<string, unknown> = {
    trading_account_id: input.tradingAccountId,
    ticker: input.ticker,
    asset_class: input.assetClass,
    side: input.side,
    order_type: input.orderType,
    quantity: input.quantity,
  };
  if (input.timeInForce) body.time_in_force = input.timeInForce;
  if (input.limitPrice) body.limit_price = input.limitPrice;
  if (input.stopPrice) body.stop_price = input.stopPrice;

  return api.post<Order>("/orders", { body });
}
