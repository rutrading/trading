/**
 * Price formatters that handle both equities ($270.27) and sub-dollar crypto
 * ($0.00000372 PEPE). For prices ≥ $1 show 2 decimals; for smaller values,
 * show enough precision that the number isn't rounded to $0.00.
 */

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.00";
  const abs = Math.abs(n);
  if (abs >= 1) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (abs >= 0.01) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  // Sub-cent: up to 8 significant decimals.
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}
