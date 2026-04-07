"use client";

import { useEffect, useState } from "react";
import {
  WifiHighIcon,
  WifiSlashIcon,
  WifiMediumIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
} from "@phosphor-icons/react";

import { SymbolSearch, type SymbolItem } from "@/components/symbol-search";
import {
  type QuoteData,
  ReadyState,
  useQuotes,
  useRestoredTickers,
  useWSReadyState,
} from "@/hooks/use-quotes";

const STATUS_MAP: Record<ReadyState, { label: string; color: string }> = {
  [ReadyState.CONNECTING]: { label: "Connecting", color: "text-yellow-500" },
  [ReadyState.OPEN]: { label: "Connected", color: "text-emerald-500" },
  [ReadyState.CLOSING]: { label: "Closing", color: "text-yellow-500" },
  [ReadyState.CLOSED]: { label: "Disconnected", color: "text-destructive" },
  [ReadyState.UNINSTANTIATED]: {
    label: "Not started",
    color: "text-muted-foreground",
  },
};

function StatusIcon({ state }: { state: ReadyState }) {
  if (state === ReadyState.OPEN)
    return <WifiHighIcon weight="bold" className="size-4" />;
  if (state === ReadyState.CONNECTING || state === ReadyState.CLOSING)
    return <WifiMediumIcon weight="bold" className="size-4" />;
  return <WifiSlashIcon weight="bold" className="size-4" />;
}

function QuoteCard({
  ticker,
  data,
  onRemove,
}: {
  ticker: string;
  data: QuoteData;
  onRemove: () => void;
}) {
  const isPositive = data.change >= 0;

  return (
    <div className="group relative flex items-center justify-between rounded-lg border border-border px-4 py-4">
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <XIcon className="size-4" />
      </button>
      <div>
        <p className="text-sm font-semibold">{ticker}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">
          ${data.price.toFixed(2)}
        </p>
      </div>
      <div className="text-right">
        <div
          className={`flex items-center justify-end gap-1 text-sm font-medium ${
            isPositive ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {isPositive ? (
            <ArrowUpIcon weight="bold" className="size-4" />
          ) : (
            <ArrowDownIcon weight="bold" className="size-4" />
          )}
          <span className="tabular-nums">
            {data.change >= 0 ? "+" : ""}
            {data.change.toFixed(2)}
          </span>
          <span className="tabular-nums">
            ({data.change_percent.toFixed(2)}%)
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Bid {data.bid_price.toFixed(2)} / Ask {data.ask_price.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">{data.source} tick</p>
      </div>
    </div>
  );
}

export function TestClient() {
  const [activeTickers, setActiveTickers] = useState<string[]>([]);
  const quotes = useQuotes(activeTickers);
  const readyState = useWSReadyState();
  const restoredTickers = useRestoredTickers();
  const status = STATUS_MAP[readyState];

  // merge restored tickers from server grace period on reconnect
  useEffect(() => {
    if (restoredTickers.length === 0) return;
    setActiveTickers((prev) => {
      const combined = new Set([...prev, ...restoredTickers]);
      return [...combined];
    });
  }, [restoredTickers]);

  function handleSelect(item: SymbolItem) {
    setActiveTickers((prev) => {
      // don't add duplicates
      if (prev.includes(item.ticker)) return prev;
      return [...prev, item.ticker];
    });
  }

  function handleRemove(ticker: string) {
    setActiveTickers((prev) => prev.filter((t) => t !== ticker));
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          WebSocket Test
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribe to tickers and watch mock quotes stream in real-time.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <StatusIcon state={readyState} />
        <span className={`text-sm font-medium ${status.color}`}>
          {status.label}
        </span>
        {activeTickers.length > 0 && (
          <span className="text-sm text-muted-foreground">
            &middot; {activeTickers.length} ticker
            {activeTickers.length !== 1 && "s"} subscribed
          </span>
        )}
      </div>

      <div className="max-w-sm">
        <SymbolSearch
          placeholder="Add a ticker..."
          onSelect={handleSelect}
        />
      </div>

      {activeTickers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeTickers.map((ticker) => {
            const data = quotes.get(ticker);
            if (!data) {
              return (
                <div
                  key={ticker}
                  className="group relative flex items-center justify-between rounded-lg border border-border px-4 py-4"
                >
                  <p className="text-sm font-semibold">{ticker}</p>
                  <p className="text-sm text-muted-foreground">
                    Waiting for data...
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRemove(ticker)}
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
              );
            }
            return (
              <QuoteCard
                key={ticker}
                ticker={ticker}
                data={data}
                onRemove={() => handleRemove(ticker)}
              />
            );
          })}
        </div>
      )}

      {activeTickers.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Search and add tickers above to start streaming quotes.
        </p>
      )}
    </div>
  );
}
