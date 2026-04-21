"use server";

import { getSession } from "@/app/actions/auth";
import * as api from "@/lib/api";

type OrderSide = "buy" | "sell";
type OrderType = "market" | "limit" | "stop" | "stop_limit";
type AssetClass = "us_equity" | "crypto";

export type PlaceOrderRequest = {
  trading_account_id: number;
  ticker: string;
  asset_class: AssetClass;
  side: OrderSide;
  order_type: OrderType;
  time_in_force?: "day" | "gtc";
  quantity: string;
  limit_price?: string | null;
  stop_price?: string | null;
};

type PlaceOrderResponse = {
  id: number;
  status: string;
  ticker: string;
};

export async function placeOrder(
  payload: PlaceOrderRequest,
): Promise<api.ApiResult<PlaceOrderResponse>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not authenticated" };
  return api.postJson<PlaceOrderResponse>("/orders", payload);
}
