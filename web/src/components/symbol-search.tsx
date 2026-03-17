"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  MagnifyingGlassIcon,
  SpinnerGapIcon,
  TrendUpIcon,
  XIcon,
} from "@phosphor-icons/react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  searchSymbols,
  getTrendingSymbols,
  trackSymbol,
} from "@/app/actions/symbols";
import { cn } from "@/lib/utils";

type SearchResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

export type SymbolItem = {
  value: string;
  label: string;
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

function toItem(r: SearchResult): SymbolItem {
  return {
    value: r.ticker,
    label: `${r.ticker} — ${r.name}`,
    ticker: r.ticker,
    name: r.name,
    exchange: r.exchange,
    assetClass: r.assetClass,
  };
}

function HighlightedTicker({
  ticker,
  query,
}: {
  ticker: string;
  query: string;
}) {
  const q = query.trim().toUpperCase();

  // only highlight prefix matches
  if (!q || !ticker.toUpperCase().startsWith(q)) {
    return <span>{ticker}</span>;
  }

  return (
    <span>
      <span className="text-primary">{ticker.slice(0, q.length)}</span>
      {ticker.slice(q.length)}
    </span>
  );
}

function useSymbolSearch() {
  const [searchResults, setSearchResults] = useState<SymbolItem[]>([]);
  const [trending, setTrending] = useState<SymbolItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [inputValue, setInputValue] = useState("");
  const debouncedQuery = useDebouncedValue(inputValue);
  const trendingLoaded = useRef(false);

  // load trending once on mount
  useEffect(() => {
    if (trendingLoaded.current) return;
    trendingLoaded.current = true;
    startTransition(async () => {
      const results = await getTrendingSymbols();
      setTrending(results.map(toItem));
    });
  }, []);

  // fire search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    startTransition(async () => {
      const results = await searchSymbols(debouncedQuery);
      setSearchResults(results.map(toItem));
    });
  }, [debouncedQuery]);

  // search has settled when the debounced value matches the current input
  const isSettled = debouncedQuery === inputValue && !isPending;

  return {
    searchResults,
    trending,
    isPending,
    isSettled,
    inputValue,
    setInputValue,
  };
}

type SymbolSearchProps = {
  onSelect?: (item: SymbolItem) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  size?: "sm" | "default" | "lg";
};

export function SymbolSearch({
  onSelect,
  placeholder = "Search tickers...",
  className,
  autoFocus,
  size = "sm",
}: SymbolSearchProps) {
  const {
    searchResults,
    trending,
    isPending,
    isSettled,
    inputValue,
    setInputValue,
  } = useSymbolSearch();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasQuery = inputValue.trim().length > 0;

  // show search results when typing, trending when focused with no query
  const displayItems = hasQuery ? searchResults : trending;

  // split results by asset class, stocks first then crypto
  const stocks = displayItems.filter((r) => r.assetClass === "us_equity");
  const crypto = displayItems.filter((r) => r.assetClass === "crypto");
  const orderedResults = hasQuery ? [...stocks, ...crypto] : trending;

  // close on outside click
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(e: MouseEvent) {
      // click landed inside the container — ignore
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults, trending, hasQuery]);

  function selectItem(item: SymbolItem) {
    // track selection for trending rankings
    trackSymbol(item.ticker);
    onSelect?.(item);
    setInputValue("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || orderedResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) =>
        i < orderedResults.length - 1 ? i + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) =>
        i > 0 ? i - 1 : orderedResults.length - 1,
      );
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectItem(orderedResults[highlightedIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  // track the flat index for highlighting across groups
  let flatIndex = -1;

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <InputGroup>
        <InputGroupInput
          ref={inputRef}
          size={size}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
        />
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            {isPending ? (
              <SpinnerGapIcon className="animate-spin" weight="bold" />
            ) : (
              <MagnifyingGlassIcon />
            )}
          </InputGroupText>
        </InputGroupAddon>
        {inputValue && (
          <InputGroupAddon align="inline-end">
            <button
              type="button"
              className="flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => {
                setInputValue("");
                inputRef.current?.focus();
              }}
              tabIndex={-1}
            >
              <XIcon className="size-4" />
            </button>
          </InputGroupAddon>
        )}
      </InputGroup>

      {open && (
        <div className="absolute top-full z-50 mt-1 w-96 rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div>
            <ScrollArea className="h-auto max-h-80 w-full">
              <div className="py-2">
              {/* loading trending on first focus */}
              {!hasQuery && trending.length === 0 && isPending && (
                <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                  Loading...
                </p>
              )}

              {/* trending / popular header */}
              {!hasQuery && trending.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-1">
                  <TrendUpIcon className="size-4 text-muted-foreground" weight="bold" />
                  <p className="text-xs font-medium text-muted-foreground">
                    Trending
                  </p>
                </div>
              )}

              {/* has query — show spinner or results; only show empty state once settled */}
              {hasQuery && searchResults.length === 0 && (
                <p className="px-4 py-4 text-center text-sm text-muted-foreground">
                  {isSettled ? "No symbols found." : "Searching..."}
                </p>
              )}

              {/* trending list (no grouping, flat list) */}
              {!hasQuery && trending.length > 0 && (
                <div>
                  {trending.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <ResultRow
                        key={item.value}
                        item={item}
                        query=""
                        highlighted={idx === highlightedIndex}
                        meta={
                          item.assetClass === "crypto"
                            ? "Crypto"
                            : item.exchange
                              ? `Equity · ${item.exchange}`
                              : "Equity"
                        }
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onSelect={() => selectItem(item)}
                      />
                    );
                  })}
                </div>
              )}

              {/* search results grouped by asset class */}
              {hasQuery && stocks.length > 0 && (
                <div>
                  <p className="px-4 py-1 text-xs font-medium text-muted-foreground">
                    Stocks
                  </p>
                  {stocks.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <ResultRow
                        key={item.value}
                        item={item}
                        query={inputValue}
                        highlighted={idx === highlightedIndex}
                        meta={
                          item.exchange
                            ? `Equity · ${item.exchange}`
                            : "Equity"
                        }
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onSelect={() => selectItem(item)}
                      />
                    );
                  })}
                </div>
              )}

              {hasQuery && crypto.length > 0 && (
                <div>
                  {stocks.length > 0 && (
                    <div className="mx-4 my-1 h-px bg-border" />
                  )}
                  <p className="px-4 py-1 text-xs font-medium text-muted-foreground">
                    Crypto
                  </p>
                  {crypto.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <ResultRow
                        key={item.value}
                        item={item}
                        query={inputValue}
                        highlighted={idx === highlightedIndex}
                        meta="Crypto"
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onSelect={() => selectItem(item)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  item,
  query,
  highlighted,
  meta,
  onMouseEnter,
  onSelect,
}: {
  item: SymbolItem;
  query: string;
  highlighted: boolean;
  meta: string;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-4 px-4 py-2 text-left transition-colors",
        highlighted
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50",
      )}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => {
        // prevent input blur so the dropdown stays open until selectItem runs
        e.preventDefault();
        onSelect();
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">
            <HighlightedTicker ticker={item.ticker} query={query} />
          </span>
          <span className="text-xs text-muted-foreground/48">
            {meta}
          </span>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {item.name}
        </span>
      </div>
    </button>
  );
}
