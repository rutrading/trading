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

// Partials: trade ticks carry price/change, quote ticks carry bid/ask. The
// provider merges incoming partials onto any prior snapshot, so consumers
// must null-check each field.
export type QuoteData = {
  price?: number;
  change?: number;
  change_percent?: number;
  bid_price?: number;
  ask_price?: number;
  timestamp: number;
  source: string;
};

type WSContextValue = {
  subscribe: (ticker: string) => () => void;
  quotes: Map<string, QuoteData>;
  readyState: ReadyState;
  restoredTickers: string[];
};

const WSContext = createContext<WSContextValue | null>(null);

const WS_BASE: string =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/api/ws";

export function WebSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [restoredTickers, setRestoredTickers] = useState<string[]>([]);

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

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(
    getSocketUrl,
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

  // handle incoming messages
  useEffect(() => {
    if (!lastJsonMessage) return;
    const msg = lastJsonMessage as {
      type?: string;
      ticker?: string;
      data?: QuoteData;
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

export function useQuote(ticker: string | null): QuoteData | null {
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

export function useQuotes(tickers: string[]): Map<string, QuoteData> {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useQuotes must be used within WebSocketProvider");

  useEffect(() => {
    const unsubs = tickers.map((t) => ctx.subscribe(t));
    return () => unsubs.forEach((fn) => fn());
    // The joined string key is the intentional stable dep — using `tickers`
    // directly would re-run on every render even when contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(",")]);

  const filtered = new Map<string, QuoteData>();
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
