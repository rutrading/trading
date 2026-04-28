"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

import type { Quote } from "@/lib/quote";

type WSContextValue = {
  subscribe: (ticker: string) => () => void;
  quotes: Map<string, Quote>;
  readyState: ReadyState;
  restoredTickers: string[];
};

const WSContext = createContext<WSContextValue | null>(null);

const WS_BASE: string =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/ws";
const USE_REST_QUOTES =
  process.env.NEXT_PUBLIC_MARKET_DATA_TRANSPORT?.toLowerCase() === "rest";
const REST_POLL_INTERVAL_MS = 15000;

export function WebSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [restoredTickers, setRestoredTickers] = useState<string[]>([]);
  const [subscribedTickers, setSubscribedTickers] = useState<string[]>([]);

  // ref-counted subscriptions: ticker -> number of active subscribers
  const refCounts = useRef(new Map<string, number>());

  // Token cached on every (re)connect. Used as the auth-frame payload sent
  // immediately after the socket opens — the JWT no longer rides on the
  // upgrade URL, so it stays out of access logs and the Referer header.
  const tokenRef = useRef<string | null>(null);

  // Fetch a fresh JWT on every (re)connect. Better-auth JWTs are short-lived;
  // baking a stale token into the connection causes 4001 spam once it
  // expires. react-use-websocket calls this function again on each reconnect.
  // Must be a stable reference — a new function each render would tear down
  // and recreate the socket on every render.
  const getSocketUrl = useCallback(async () => {
    try {
      const res = await fetch("/api/ws-token", { cache: "no-store" });
      if (res.ok) {
        const { token } = (await res.json()) as { token: string | null };
        tokenRef.current = token ?? null;
      } else {
        tokenRef.current = null;
      }
    } catch {
      tokenRef.current = null;
    }
    return WS_BASE;
  }, []);

  const refreshTicker = useCallback(async (ticker: string) => {
    try {
      const res = await fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as { ok: boolean; data?: Quote };
      if (!payload.ok || !payload.data) return;
      const data = payload.data;
      setQuotes((prev) => {
        const next = new Map(prev);
        const key = ticker.toUpperCase();
        const prior = prev.get(key);
        next.set(key, prior ? { ...prior, ...data } : data);
        return next;
      });
    } catch {
      // REST-only mode is a dev fallback; keep stale data instead of erroring UI.
    }
  }, []);

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(
    USE_REST_QUOTES ? null : getSocketUrl,
    {
      shouldReconnect: () => true,
      reconnectAttempts: Infinity,
      reconnectInterval: (attempt) =>
        Math.min(Math.pow(2, attempt) * 1000, 10000),
      share: true,
      heartbeat: {
        message: JSON.stringify({ type: "ping" }),
        returnMessage: JSON.stringify({ type: "pong" }),
        timeout: 60000,
        interval: 25000,
      },
    },
  );

  useEffect(() => {
    if (!USE_REST_QUOTES) return;
    if (subscribedTickers.length === 0) return;

    const poll = () => {
      for (const ticker of subscribedTickers) {
        void refreshTicker(ticker);
      }
    };

    poll();
    const id = window.setInterval(poll, REST_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refreshTicker, subscribedTickers]);

  // handle incoming messages
  useEffect(() => {
    if (!lastJsonMessage) return;
    const msg = lastJsonMessage as {
      type?: string;
      ticker?: string;
      data?: Quote;
      tickers?: string[];
    };

    if (msg.type === "quote" && msg.ticker && msg.data) {
      setQuotes((prev) => {
        const next = new Map(prev);
        // Merge over any prior cached entry instead of replacing it. Alpaca's
        // free SIP feed only pushes trade ticks (price, change), not quote
        // ticks (bid_price, ask_price). When the WS update lands after a REST
        // snapshot has populated bid/ask, replacing wholesale would drop them
        // to undefined and the QuoteStrip would render "—".
        const prior = prev.get(msg.ticker!);
        next.set(msg.ticker!, prior ? { ...prior, ...msg.data! } : msg.data!);
        return next;
      });
    }

    // server restored subs from a previous session's grace period.
    // We deliberately do NOT bump refCounts here: by the time `restored`
    // arrives the new mounts have already called subscribe(), so bumping
    // would leave a stale count that prevents unsubscribe from ever
    // reaching zero. Consumers can still react via useRestoredTickers().
    if (msg.type === "restored" && msg.tickers) {
      setRestoredTickers(msg.tickers);
    }
  }, [lastJsonMessage]);

  // On every fresh connection: send the auth frame first (the backend
  // expects {type: "auth", token: ...} as the very first message), then
  // re-subscribe to whatever tickers are still in the ref-count map. The
  // backend closes 4001 if auth is missing or invalid, which trips
  // react-use-websocket's reconnect logic naturally.
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    sendJsonMessage({ type: "auth", token: tokenRef.current ?? "" });
    const tickers = [...refCounts.current.keys()];
    if (tickers.length > 0) {
      sendJsonMessage({ type: "subscribe", tickers });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyState]);

  function subscribe(ticker: string): () => void {
    const t = ticker.toUpperCase();
    const count = refCounts.current.get(t) ?? 0;
    refCounts.current.set(t, count + 1);
    if (count === 0) {
      setSubscribedTickers([...refCounts.current.keys()]);
    }

    if (USE_REST_QUOTES) {
      void refreshTicker(t);
      return () => {
        const current = refCounts.current.get(t) ?? 0;
        if (current <= 1) {
          refCounts.current.delete(t);
          setSubscribedTickers([...refCounts.current.keys()]);
          setQuotes((prev) => {
            const next = new Map(prev);
            next.delete(t);
            return next;
          });
        } else {
          refCounts.current.set(t, current - 1);
        }
      };
    }

    // First subscriber — tell the server, but only if the socket is open.
    // Otherwise the open-effect below will bulk-subscribe from refCounts
    // once the connection is ready. Sending while CONNECTING would queue
    // the message, then the open-effect would re-send the same ticker.
    if (count === 0 && readyState === ReadyState.OPEN) {
      sendJsonMessage({ type: "subscribe", tickers: [t] });
    }

    // return unsubscribe function
    return () => {
      const current = refCounts.current.get(t) ?? 0;
      if (current <= 1) {
        refCounts.current.delete(t);
        setSubscribedTickers([...refCounts.current.keys()]);
        if (readyState === ReadyState.OPEN) {
          sendJsonMessage({ type: "unsubscribe", tickers: [t] });
        }
        setQuotes((prev) => {
          const next = new Map(prev);
          next.delete(t);
          return next;
        });
      } else {
        refCounts.current.set(t, current - 1);
      }
    };
  }

  return (
    <WSContext.Provider
      value={{ subscribe, quotes, readyState, restoredTickers }}
    >
      {children}
    </WSContext.Provider>
  );
}

export function useQuote(ticker: string | null): Quote | null {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useQuote must be used within WebSocketProvider");

  useEffect(() => {
    if (!ticker) return;
    return ctx.subscribe(ticker);
    // ctx.subscribe is captured by closure but its identity is intentionally
    // omitted from deps — including it would resubscribe on every parent
    // render, dropping and reacquiring the WS subscription each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return ticker ? (ctx.quotes.get(ticker.toUpperCase()) ?? null) : null;
}

export function useQuotes(tickers: string[]): Map<string, Quote> {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useQuotes must be used within WebSocketProvider");

  useEffect(() => {
    const unsubs = tickers.map((t) => ctx.subscribe(t));
    return () => unsubs.forEach((fn) => fn());
    // The joined string key is the intentional stable dep — using `tickers`
    // directly would re-run on every render even when contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(",")]);

  const filtered = new Map<string, Quote>();
  for (const t of tickers) {
    const key = t.toUpperCase();
    const q = ctx.quotes.get(key);
    if (q) filtered.set(key, q);
  }
  return filtered;
}

export function useWSReadyState(): ReadyState {
  const ctx = useContext(WSContext);
  if (!ctx)
    throw new Error("useWSReadyState must be used within WebSocketProvider");
  return ctx.readyState;
}

export function useRestoredTickers(): string[] {
  const ctx = useContext(WSContext);
  if (!ctx)
    throw new Error("useRestoredTickers must be used within WebSocketProvider");
  return ctx.restoredTickers;
}

export type ConnectionStatus = "connecting" | "live" | "delayed" | "offline";

// useConnectionStatus: returns a human-readable connection status for UI display.
// "live"      — WebSocket is open and receiving data
// "delayed"   — WebSocket is closed but we have cached quote data (stale prices)
// "connecting"— WebSocket is in the process of connecting or reconnecting
// "offline"   — no connection and no cached data at all
export function useConnectionStatus(_ticker?: string): ConnectionStatus {
  const ctx = useContext(WSContext);
  if (!ctx)
    throw new Error(
      "useConnectionStatus must be used within WebSocketProvider",
    );

  const readyState = ctx.readyState;
  const quotes = ctx.quotes;

  switch (readyState) {
    case ReadyState.OPEN:
      return "live";
    case ReadyState.UNINSTANTIATED:
    case ReadyState.CONNECTING:
      return "connecting";
    case ReadyState.CLOSING:
    case ReadyState.CLOSED:
      if (_ticker && quotes.get(_ticker)) {
        return "delayed";
      } else if (!_ticker && quotes.size > 0) {
        return "delayed";
      }
      return "offline";
    default:
      return "offline";
  }
}

export { ReadyState };
