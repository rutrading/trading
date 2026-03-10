"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { searchSymbols } from "@/app/actions/symbols";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandFooter,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SearchResult = {
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

type CommandItem = {
  value: string;
  label: string;
  ticker: string;
  name: string;
  exchange: string | null;
  assetClass: "us_equity" | "crypto";
};

export function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(() => {
      startTransition(async () => {
        const data = await searchSymbols(query);
        setResults(data);
      });
    }, 150);

    return () => clearTimeout(timeout);
  }, [query]);

  const items = useMemo<CommandItem[]>(
    () =>
      results.map((r) => ({
        value: r.ticker,
        label: `${r.ticker} ${r.name}`,
        ticker: r.ticker,
        name: r.name,
        exchange: r.exchange,
        assetClass: r.assetClass,
      })),
    [results],
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground"
      >
        <MagnifyingGlassIcon className="size-4" />
        <span className="hidden sm:inline">Search symbols...</span>
        <CommandShortcut className="hidden sm:inline">
          <kbd>Ctrl</kbd> <kbd>K</kbd>
        </CommandShortcut>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>
          <Command
            items={items}
            value={query}
            onValueChange={setQuery}
          >
            <CommandInput placeholder="Search by ticker or company name..." />
            <CommandPanel>
              <CommandList>
                {(item: CommandItem) => (
                  <CommandItem
                    key={item.ticker}
                    value={item.value}
                    onSelect={() => {
                      setOpen(false);
                      router.push(`/stocks/${item.ticker}`);
                    }}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm">{item.ticker}</span>
                      <span className="truncate text-sm text-muted-foreground">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.exchange && (
                        <span className="text-xs text-muted-foreground">
                          {item.exchange}
                        </span>
                      )}
                      <Badge variant="outline" size="sm">
                        {item.assetClass === "crypto" ? "Crypto" : "Stock"}
                      </Badge>
                    </div>
                  </CommandItem>
                )}
              </CommandList>
              <CommandEmpty>
                {isPending
                  ? "Searching..."
                  : query.trim()
                    ? "No symbols found."
                    : "Start typing to search..."}
              </CommandEmpty>
            </CommandPanel>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
