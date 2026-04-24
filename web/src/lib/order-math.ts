/**
 * Helpers for converting between dollar amounts and share quantities at the
 * order-placement boundary. The backend only accepts share quantities, so any
 * dollar-denominated input has to be turned into shares before submission.
 */

export type DollarsToSharesResult =
  | { ok: true; shares: string }
  | { ok: false; reason: "amount_too_small" };

/**
 * Convert a dollar amount to a share quantity at a given reference price.
 *
 * Floors (rather than rounds) at the 8-decimal column scale so:
 *   - Buys never overspend by one ULP — `flooredShares * price <= dollars`.
 *   - Sells never try to sell more than the user holds.
 *
 * Returns `amount_too_small` for sub-tick conversions that round to zero
 * (e.g. $0.01 of a $50k BTC quote produces 0 shares at scale 8); the caller
 * must surface that as a user-facing error rather than submit an empty
 * quantity to the backend.
 */
export function dollarsToShares(
  dollars: number,
  referencePrice: number,
): DollarsToSharesResult {
  if (
    !Number.isFinite(dollars) ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0 ||
    dollars <= 0
  ) {
    return { ok: false, reason: "amount_too_small" };
  }
  const flooredShares = Math.floor((dollars / referencePrice) * 1e8) / 1e8;
  const stripped = flooredShares.toFixed(8).replace(/\.?0+$/, "");
  if (!stripped || parseFloat(stripped) <= 0) {
    return { ok: false, reason: "amount_too_small" };
  }
  return { ok: true, shares: stripped };
}
