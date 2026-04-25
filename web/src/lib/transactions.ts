/**
 * Pure helpers used by the activity / transaction-history views.
 *
 * Lives outside the `"use server"` boundary so it can be unit-tested without
 * a Next.js runtime, and so the synchronous walk function is callable from
 * client components if ever needed.
 */

export type WalkInput = {
  id: number;
  kind: "trade" | "deposit" | "withdrawal";
  side: "buy" | "sell" | null;
  total: string;
  created_at: string;
};

export type WalkOutput<T extends WalkInput> = T & {
  trading_account_id: number;
  cash_after: string;
};

/**
 * Merge per-account transactions, sort newest-first with id tie-break, and
 * walk backward to compute `cash_after` for each row.
 *
 * The id tie-break is load-bearing: the migration's seed deposit shares the
 * trading account's `created_at`, and a market order placed during account
 * creation can land in the same second. Without the secondary sort the walk
 * can put the trade after the deposit, producing a wrong `cash_after` for
 * that pair.
 */
export function computeRunningCashWalk<T extends WalkInput>(
  rowsByAccount: Array<{ id: number; rows: T[] }>,
  cashByAccount: Record<number, string>,
): Array<WalkOutput<T>> {
  const merged: Array<WalkOutput<T>> = [];
  for (const { id, rows } of rowsByAccount) {
    for (const r of rows) {
      merged.push({ ...r, trading_account_id: id, cash_after: "0" });
    }
  }
  merged.sort((a, b) => {
    const cmp = b.created_at.localeCompare(a.created_at);
    if (cmp !== 0) return cmp;
    return b.id - a.id;
  });

  const running: Record<number, number> = {};
  for (const { id } of rowsByAccount) {
    running[id] = parseFloat(cashByAccount[id] ?? "0");
  }
  for (const t of merged) {
    const after = running[t.trading_account_id] ?? 0;
    t.cash_after = after.toFixed(2);
    const total = parseFloat(t.total);
    let effect = 0;
    if (t.kind === "trade") effect = t.side === "buy" ? -total : total;
    else if (t.kind === "deposit") effect = total;
    else if (t.kind === "withdrawal") effect = -total;
    running[t.trading_account_id] = after - effect;
  }
  return merged;
}
