"use client";

import { useEffect, useState, useTransition } from "react";
import {
  MagnifyingGlassIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";

import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "@/components/ui/combobox";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getQuoteability } from "@/app/actions/quotes";
import {
  searchSymbols,
  getTrendingSymbols,
  trackSymbol,
} from "@/app/actions/symbols";

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

async function onlyQuoteable(items: SymbolItem[]): Promise<SymbolItem[]> {
  if (items.length === 0) return items;
  const status = await getQuoteability(items.map((item) => item.ticker));
  return items.filter((item) => status[item.ticker]?.quoteable === true);
}

function useSymbolSearch(
  assetClass?: "us_equity" | "crypto",
  requireQuoteable = false,
) {
  const [searchResults, setSearchResults] = useState<SymbolItem[]>([]);
  const [trending, setTrending] = useState<SymbolItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const [inputValue, setInputValue] = useState("");
  const debouncedQuery = useDebouncedValue(inputValue);

  // reload trending when the asset-class hint changes
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const results = await getTrendingSymbols(assetClass);
      const items = results.map(toItem);
      const next = requireQuoteable ? await onlyQuoteable(items) : items;
      if (!cancelled) setTrending(next);
    });
    return () => {
      cancelled = true;
    };
  }, [assetClass, requireQuoteable]);

  // fire search when debounced query changes
  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      return () => {
        cancelled = true;
      };
    }
    startTransition(async () => {
      const results = await searchSymbols(debouncedQuery);
      const items = results.map(toItem);
      const next = requireQuoteable ? await onlyQuoteable(items) : items;
      if (!cancelled) setSearchResults(next);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, requireQuoteable]);

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
  filter?: (item: SymbolItem) => boolean;
  assetClass?: "us_equity" | "crypto";
  requireQuoteable?: boolean;
};

export function SymbolSearch({
  onSelect,
  placeholder = "Search tickers...",
  className,
  autoFocus,
  size = "sm",
  filter,
  assetClass,
  requireQuoteable = false,
}: SymbolSearchProps) {
  const {
    searchResults: rawResults,
    trending: rawTrending,
    isPending,
    isSettled,
    inputValue,
    setInputValue,
  } = useSymbolSearch(assetClass, requireQuoteable);
  const searchResults = filter ? rawResults.filter(filter) : rawResults;
  const trending = filter ? rawTrending.filter(filter) : rawTrending;
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SymbolItem | null>(null);

  const hasQuery = inputValue.trim().length > 0;

  // show search results when typing, trending when focused with no query
  const displayItems = hasQuery ? searchResults : trending;

  // split results by asset class, stocks first then crypto
  const stocks = displayItems.filter((r) => r.assetClass === "us_equity");
  const crypto = displayItems.filter((r) => r.assetClass === "crypto");
  const orderedResults = hasQuery ? [...stocks, ...crypto] : trending;

  function selectItem(item: SymbolItem) {
    // track selection for trending rankings
    trackSymbol(item.ticker);
    setSelectedItem(item);
    onSelect?.(item);
    setInputValue(item.ticker);
    setOpen(false);
  }

  return (
    <Combobox<SymbolItem>
      items={orderedResults}
      inputValue={inputValue}
      open={open}
      onOpenChange={setOpen}
      onInputValueChange={(value) => {
        if (selectedItem && value === selectedItem.label) {
          setInputValue(selectedItem.ticker);
          setOpen(false);
          return;
        }
        if (selectedItem && value !== selectedItem.ticker) {
          setSelectedItem(null);
        }
        setInputValue(value.toUpperCase());
        setOpen(true);
      }}
      onValueChange={(item) => {
        if (item) selectItem(item as SymbolItem);
      }}
      filter={null}
      itemToStringLabel={(item) => item?.label ?? ""}
      itemToStringValue={(item) => item?.value ?? ""}
    >
      <ComboboxInput
        className={className}
        size={size}
        placeholder={placeholder}
        autoFocus={autoFocus}
        showTrigger={false}
        showClear={inputValue.length > 0}
        startAddon={
          open && isPending ? (
            <Spinner className="size-4" />
          ) : (
            <MagnifyingGlassIcon />
          )
        }
        clearProps={{
          onClick: () => {
            setSelectedItem(null);
            setInputValue("");
            setOpen(false);
          },
        }}
      />
      <ComboboxPopup className="w-96">
              {!hasQuery && trending.length === 0 && isPending && (
                <ComboboxEmpty>
                  Loading...
                </ComboboxEmpty>
              )}

              {/* trending / popular header */}
              {!hasQuery && trending.length > 0 && (
                <ComboboxGroup items={trending}>
                  <ComboboxGroupLabel className="flex items-center gap-2">
                    <TrendUpIcon className="size-4" weight="bold" />
                    Trending
                  </ComboboxGroupLabel>
                  <ComboboxList>
                    {(item: SymbolItem) => <SymbolOption key={item.value} item={item} query="" />}
                  </ComboboxList>
                </ComboboxGroup>
              )}

              {/* has query — show spinner or results; only show empty state once settled */}
              {hasQuery && searchResults.length === 0 && (
                <ComboboxEmpty>
                  {isSettled ? "No symbols found." : "Searching..."}
                </ComboboxEmpty>
              )}

              {/* search results grouped by asset class */}
              {hasQuery && stocks.length > 0 && (
                <ComboboxGroup items={stocks}>
                  <ComboboxGroupLabel>Stocks</ComboboxGroupLabel>
                  <ComboboxList>
                    {(item: SymbolItem) => <SymbolOption key={item.value} item={item} query={inputValue} />}
                  </ComboboxList>
                </ComboboxGroup>
              )}

              {hasQuery && crypto.length > 0 && (
                <ComboboxGroup items={crypto}>
                  <ComboboxGroupLabel>Crypto</ComboboxGroupLabel>
                  <ComboboxList>
                    {(item: SymbolItem) => <SymbolOption key={item.value} item={item} query={inputValue} />}
                  </ComboboxList>
                </ComboboxGroup>
              )}
      </ComboboxPopup>
    </Combobox>
  );
}

function SymbolOption({
  item,
  query,
}: {
  item: SymbolItem;
  query: string;
}) {
  const meta =
    item.assetClass === "crypto"
      ? "Crypto"
      : item.exchange
        ? `Equity · ${item.exchange}`
        : "Equity";

  return (
    <ComboboxItem value={item}>
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
    </ComboboxItem>
  );
}
