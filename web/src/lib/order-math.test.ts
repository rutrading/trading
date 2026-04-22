import { describe, expect, it } from "vitest";

import { dollarsToShares } from "./order-math";

describe("dollarsToShares", () => {
  it("converts a clean whole-share amount", () => {
    const r = dollarsToShares(500, 100);
    expect(r).toEqual({ ok: true, shares: "5" });
  });

  it("floors fractional shares so a buy never overspends by one ULP", () => {
    // 1 / 3 at scale 8 = 0.33333333… Floor → 0.33333333. shares*price = 99.999999
    const r = dollarsToShares(100, 300);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const shares = parseFloat(r.shares);
      expect(shares * 300).toBeLessThanOrEqual(100);
      // Sanity: well above zero
      expect(shares).toBeGreaterThan(0.33);
      expect(shares).toBeLessThan(0.34);
    }
  });

  it("strips trailing zeros from the formatted share string", () => {
    const r = dollarsToShares(50, 100);
    expect(r).toEqual({ ok: true, shares: "0.5" });
  });

  it("rejects sub-tick amounts that round to zero shares", () => {
    // $0.0001 / $50,000 = 2e-9 shares — below the numeric(16,8) precision
    // floor, so floors to 0.
    const r = dollarsToShares(0.0001, 50000);
    expect(r).toEqual({ ok: false, reason: "amount_too_small" });
  });

  it("rejects a zero or negative dollar amount", () => {
    expect(dollarsToShares(0, 100)).toEqual({ ok: false, reason: "amount_too_small" });
    expect(dollarsToShares(-5, 100)).toEqual({ ok: false, reason: "amount_too_small" });
  });

  it("rejects when the reference price is non-positive", () => {
    expect(dollarsToShares(100, 0)).toEqual({ ok: false, reason: "amount_too_small" });
    expect(dollarsToShares(100, -1)).toEqual({ ok: false, reason: "amount_too_small" });
  });

  it("rejects when either input is NaN or Infinity", () => {
    expect(dollarsToShares(NaN, 100)).toEqual({ ok: false, reason: "amount_too_small" });
    expect(dollarsToShares(100, NaN)).toEqual({ ok: false, reason: "amount_too_small" });
    expect(dollarsToShares(Infinity, 100)).toEqual({ ok: false, reason: "amount_too_small" });
  });

  it("never returns an empty share string", () => {
    // Regression: previously `(qtyNum / referencePrice).toFixed(8).replace(/\.?0+$/, "")`
    // could produce "" on sub-scale-8 conversions. The helper now treats
    // those as amount_too_small instead of returning an empty string.
    const r = dollarsToShares(0.0000001, 100);
    expect(r.ok).toBe(false);
    // And anything that *does* succeed must be a non-empty parseable string.
    const ok = dollarsToShares(7.5, 3);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.shares).not.toBe("");
      expect(parseFloat(ok.shares)).toBeGreaterThan(0);
    }
  });
});
