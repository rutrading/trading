"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

export type QuoteData = {
  price: number;
  change: number;
  change_percent: number;
  bid_price: number;
  ask_price: number;
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
  token,
  children,
}: {
  token?: string;
  children: React.ReactNode;
}) {
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [restoredTickers, setRestoredTickers] = useState<string[]>([]);

  // ref-counted subscriptions: ticker -> number of active subscribers
  const refCounts = useRef(new Map<string, number>());

  // append token as query param when available
  const wsUrl = token
    ? `${WS_BASE}?token=${encodeURIComponent(token)}`
    : WS_BASE;

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(wsUrl, {
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
  });

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
        next.set(msg.ticker!, msg.data!);
        return next;
      });
    }

    // server restored subs from a previous session's grace period
    if (msg.type === "restored" && msg.tickers) {
      setRestoredTickers(msg.tickers);
      // sync ref counts with restored tickers
      for (const t of msg.tickers) {
        const count = refCounts.current.get(t) ?? 0;
        refCounts.current.set(t, count + 1);
      }
    }
  }, [lastJsonMessage]);

  // re-subscribe to all active tickers when connection opens
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    const tickers = [...refCounts.current.keys()];
    if (tickers.length > 0) {
      sendJsonMessage({ type: "subscribe", tickers });
    }
  }, [readyState]);

  function subscribe(ticker: string): () => void {
    const t = ticker.toUpperCase();
    const count = refCounts.current.get(t) ?? 0;
    refCounts.current.set(t, count + 1);

    // first subscriber — tell the server
    if (count === 0) {
      sendJsonMessage({ type: "subscribe", tickers: [t] });
    }

    // return unsubscribe function
    return () => {
      const current = refCounts.current.get(t) ?? 0;
      if (current <= 1) {
        refCounts.current.delete(t);
        sendJsonMessage({ type: "unsubscribe", tickers: [t] });
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
  }, [ticker]);

  return ticker ? (ctx.quotes.get(ticker.toUpperCase()) ?? null) : null;
}

export function useQuotes(tickers: string[]): Map<string, QuoteData> {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useQuotes must be used within WebSocketProvider");

  useEffect(() => {
    const unsubs = tickers.map((t) => ctx.subscribe(t));
    return () => unsubs.forEach((fn) => fn());
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
