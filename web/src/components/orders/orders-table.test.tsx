import { describe, expect, it } from "vitest";

import type { Order } from "@/app/actions/orders";
import { priceCell, totalCell } from "./orders-table";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    trading_account_id: 1,
    ticker: "AAPL",
    asset_class: "us_equity",
    side: "buy",
    order_type: "market",
    time_in_force: "day",
    quantity: "10",
    limit_price: null,
    stop_price: null,
    reference_price: null,
    filled_quantity: "0",
    average_fill_price: null,
    status: "open",
    rejection_reason: null,
    created_at: "2026-04-21T12:00:00Z",
    updated_at: "2026-04-21T12:00:00Z",
    last_fill_at: null,
    ...overrides,
  };
}

describe("priceCell", () => {
  it("market order with no reference_price renders 'Market'", () => {
    expect(priceCell(makeOrder({ order_type: "market" }))).toBe("Market");
  });

  it("market order with reference_price renders the snapshot price", () => {
    expect(
      priceCell(makeOrder({ order_type: "market", reference_price: "175.42" })),
    ).toBe("$175.42");
  });

  it("limit order renders the limit price", () => {
    expect(
      priceCell(makeOrder({ order_type: "limit", limit_price: "170.00" })),
    ).toBe("$170.00");
  });

  it("stop order renders the stop price when no limit price is set", () => {
    expect(
      priceCell(makeOrder({ order_type: "stop", stop_price: "180.00" })),
    ).toBe("$180.00");
  });

  it("stop_limit order prefers the limit price over the stop price", () => {
    // Both are set on a stop_limit; the column shows the limit (the trigger
    // is shown elsewhere on the expanded row).
    expect(
      priceCell(
        makeOrder({
          order_type: "stop_limit",
          stop_price: "180.00",
          limit_price: "182.50",
        }),
      ),
    ).toBe("$182.50");
  });

  it("falls back to em-dash when a non-market order has no price set at all", () => {
    expect(
      priceCell(
        makeOrder({ order_type: "limit", limit_price: null, stop_price: null }),
      ),
    ).toBe("—");
  });
});

describe("totalCell", () => {
  it("renders em-dash when nothing is filled", () => {
    expect(
      totalCell(
        makeOrder({ filled_quantity: "0", average_fill_price: null }),
      ),
    ).toBe("—");
  });

  it("renders em-dash when filled but no average_fill_price", () => {
    // Defensive — shouldn't happen in practice but the helper guards it.
    expect(
      totalCell(
        makeOrder({ filled_quantity: "5", average_fill_price: null }),
      ),
    ).toBe("—");
  });

  it("computes total for a fully filled order", () => {
    expect(
      totalCell(
        makeOrder({
          filled_quantity: "10",
          average_fill_price: "150.00",
        }),
      ),
    ).toBe("$1,500.00");
  });

  it("computes total for a partially filled order", () => {
    expect(
      totalCell(
        makeOrder({
          status: "partially_filled",
          filled_quantity: "3",
          average_fill_price: "100.00",
        }),
      ),
    ).toBe("$300.00");
  });

  it("renders fractional crypto fills with sub-dollar precision", () => {
    // fmtPrice switches to 4-decimal precision below $1 — make sure the
    // helper passes the small price through unchanged.
    const cell = totalCell(
      makeOrder({
        asset_class: "crypto",
        filled_quantity: "0.05",
        average_fill_price: "0.123",
      }),
    );
    expect(cell).toMatch(/^\$0\.\d+$/);
  });
});
