// Canonical quote shape used everywhere prices are displayed.
//
// All fields are optional and nullable because the same type travels
// three paths that each populate a different subset:
//   - `getQuote()` REST snapshot: every field present, but FastAPI
//     serialises absent values as `null` (e.g. `volume: null` for
//     symbols whose snapshot does not include a daily bar).
//   - WebSocket trade tick: `price`, `change`, `change_percent`,
//     `timestamp`, `source`. No bid/ask. Missing fields are `undefined`.
//   - WebSocket quote tick: `bid_price`, `ask_price`, `timestamp`,
//     `source`. No `price`. Missing fields are `undefined`.
//
// Consumers always read with `live?.field ?? snapshot?.field ?? null`
// (see `mergeQuote` in this file), which treats `null` and `undefined`
// the same. Defaulting to `0` is forbidden — it renders as "$0.00"
// during the WS-catchup window and confuses the user.
export type Quote = {
  ticker?: string;
  price?: number | null;
  bid_price?: number | null;
  ask_price?: number | null;
  change?: number | null;
  change_percent?: number | null;
  previous_close?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  timestamp?: number | null;
  source?: string | null;
};

// Field-by-field merge: prefer the live WS tick, fall back to the
// server snapshot, fall back to null. Centralising this guarantees
// every page reads the same precedence and never defaults a numeric
// field to zero.
export function mergeQuote(
  snapshot: Quote | null | undefined,
  live: Quote | null | undefined,
): Quote {
  return {
    ticker: live?.ticker ?? snapshot?.ticker,
    price: live?.price ?? snapshot?.price ?? null,
    bid_price: live?.bid_price ?? snapshot?.bid_price ?? null,
    ask_price: live?.ask_price ?? snapshot?.ask_price ?? null,
    change: live?.change ?? snapshot?.change ?? null,
    change_percent: live?.change_percent ?? snapshot?.change_percent ?? null,
    previous_close: live?.previous_close ?? snapshot?.previous_close ?? null,
    open: live?.open ?? snapshot?.open ?? null,
    high: live?.high ?? snapshot?.high ?? null,
    low: live?.low ?? snapshot?.low ?? null,
    volume: live?.volume ?? snapshot?.volume ?? null,
    timestamp: live?.timestamp ?? snapshot?.timestamp ?? null,
    source: live?.source ?? snapshot?.source ?? null,
  };
}
