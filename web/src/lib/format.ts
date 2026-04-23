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

// USD currency formatter shared by holdings tables, dashboard tiles, and the
// portfolio chart. `decimals` defaults to 2 for tabular money displays; pass
// 0 for chart axis labels and large-allocation summaries where cents add
// noise.
export function fmtUsd(n: number, decimals: 0 | 2 = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Signed dollar amount with explicit `+` for positive values. Used wherever
// gain/loss appears next to a tone color so the sign reads as a deliberate
// indicator rather than a math operator.
export function fmtSigned(n: number, decimals: 0 | 2 = 2): string {
  return n >= 0 ? `+${fmtUsd(n, decimals)}` : `-${fmtUsd(-n, decimals)}`;
}

// Signed percent. Same sign treatment as fmtSigned but for percentages.
export function fmtSignedPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Tailwind class for the dashboard's gain/loss color semantic. Centralized
// so a future palette tweak doesn't need to land in 5+ files.
export function tone(n: number | null | undefined): string {
  if (n == null || n === 0) return "text-muted-foreground";
  return n > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}
