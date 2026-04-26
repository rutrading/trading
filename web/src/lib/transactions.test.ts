import { describe, expect, it } from "vitest";

import { computeRunningCashWalk, type WalkInput } from "./transactions";

// Helper to keep test setup compact.
function tx(
  id: number,
  kind: WalkInput["kind"],
  total: string,
  created_at: string,
  side: WalkInput["side"] = null,
): WalkInput {
  return { id, kind, side, total, created_at };
}

describe("computeRunningCashWalk", () => {
  it("computes cash_after for a simple deposit + buy + sell sequence", () => {
    // Account: seeded with $1,000 deposit, then buys $300, then sells $100.
    // Final cash = 1000 - 300 + 100 = $800.
    const rows = [
      tx(1, "deposit", "1000", "2026-01-01T00:00:00.000Z"),
      tx(2, "trade", "300", "2026-01-02T00:00:00.000Z", "buy"),
      tx(3, "trade", "100", "2026-01-03T00:00:00.000Z", "sell"),
    ];
    const result = computeRunningCashWalk(
      [{ id: 1, rows }],
      { 1: "800" },
    );
    // Newest first
    expect(result.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(result[0].cash_after).toBe("800.00"); // post-sell
    expect(result[1].cash_after).toBe("700.00"); // post-buy (pre-sell)
    expect(result[2].cash_after).toBe("1000.00"); // post-deposit
  });

  it("breaks ties on id when two rows share a created_at — seed deposit + same-second trade", () => {
    // Regression for the bug the trading-logic-fixer landed: account created
    // at T0 with a $5,000 seed deposit (id=10), then a market BUY for $200
    // executes within the same second (id=11). Without the id tie-break the
    // walk could put the buy *before* the deposit, producing a negative
    // cash_after for the deposit.
    const sharedTime = "2026-04-01T12:00:00.000Z";
    const rows = [
      tx(10, "deposit", "5000", sharedTime),
      tx(11, "trade", "200", sharedTime, "buy"),
    ];
    const result = computeRunningCashWalk(
      [{ id: 1, rows }],
      { 1: "4800" },
    );
    // The trade (id=11) must be newest-first; deposit (id=10) is second.
    expect(result.map((r) => r.id)).toEqual([11, 10]);
    expect(result[0].cash_after).toBe("4800.00"); // post-buy
    expect(result[1].cash_after).toBe("5000.00"); // post-deposit
  });

  it("walks per-account independently when multiple accounts are merged", () => {
    const acctA = [
      tx(1, "deposit", "1000", "2026-01-01T00:00:00.000Z"),
      tx(2, "trade", "200", "2026-01-02T00:00:00.000Z", "buy"),
    ];
    const acctB = [
      tx(3, "deposit", "500", "2026-01-01T00:00:00.000Z"),
      tx(4, "trade", "50", "2026-01-02T00:00:00.000Z", "sell"),
    ];
    const result = computeRunningCashWalk(
      [
        { id: 1, rows: acctA },
        { id: 2, rows: acctB },
      ],
      { 1: "800", 2: "550" },
    );
    const a = result.filter((r) => r.trading_account_id === 1);
    const b = result.filter((r) => r.trading_account_id === 2);
    // Account A: post-buy=800, post-deposit=1000
    expect(a.map((r) => r.cash_after)).toEqual(["800.00", "1000.00"]);
    // Account B: post-sell=550, post-deposit=500
    expect(b.map((r) => r.cash_after)).toEqual(["550.00", "500.00"]);
  });

  it("handles a withdrawal", () => {
    const rows = [
      tx(1, "deposit", "1000", "2026-01-01T00:00:00.000Z"),
      tx(2, "withdrawal", "300", "2026-01-02T00:00:00.000Z"),
    ];
    const result = computeRunningCashWalk(
      [{ id: 1, rows }],
      { 1: "700" },
    );
    expect(result[0].cash_after).toBe("700.00"); // post-withdrawal
    expect(result[1].cash_after).toBe("1000.00"); // post-deposit
  });

  it("returns an empty array when no rows are passed", () => {
    expect(computeRunningCashWalk([], {})).toEqual([]);
    expect(computeRunningCashWalk([{ id: 1, rows: [] }], { 1: "100" })).toEqual([]);
  });
});
