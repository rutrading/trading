"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLine,
  Briefcase,
  Newspaper,
  Binoculars,
  GearSix,
  SignOut,
  MagnifyingGlass,
  Star,
} from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandDialogPopup,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandPanel,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandCollection,
  CommandSeparator,
  CommandFooter,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { getWatchlist } from "@/app/actions/watchlist";
import { getTrendingSymbols, searchSymbols } from "@/app/actions/symbols";

interface PageItem {
  value: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface StockItem {
  value: string;
  ticker: string;
  name: string;
}

interface ActionItem {
  value: string;
  label: string;
}

interface Group {
  value: string;
  items: (PageItem | StockItem | ActionItem)[];
}

const PAGES: PageItem[] = [
  { value: "dashboard home overview", label: "Dashboard", href: "/", icon: ChartLine },
  { value: "portfolio holdings stocks positions", label: "Portfolio", href: "/portfolio", icon: Briefcase },
  { value: "news articles headlines market", label: "News", href: "/news", icon: Newspaper },
  { value: "watchlist tracked favorites saved", label: "Watchlist", href: "/watchlist", icon: Binoculars },
  { value: "settings account profile preferences", label: "Settings", href: "/settings", icon: GearSix },
];

const ACTIONS: ActionItem[] = [
  { value: "sign out logout", label: "Sign Out" },
];

function isPageItem(item: PageItem | StockItem | ActionItem): item is PageItem {
  return "href" in item && "icon" in item;
}

function isStockItem(item: PageItem | StockItem | ActionItem): item is StockItem {
  return "ticker" in item;
}

function toStockItem(s: { ticker: string; name: string }): StockItem {
  return { value: `${s.ticker.toLowerCase()} ${s.name.toLowerCase()}`, ticker: s.ticker, name: s.name };
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const [watchlistRes, trending] = await Promise.all([
        getWatchlist(),
        getTrendingSymbols(),
      ]);
      if (watchlistRes.ok) {
        setWatchlistTickers(new Set(watchlistRes.data.watchlist.map((w) => w.ticker)));
      }
      setStocks(trending.map(toStockItem));
    });
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleSearch = useCallback((query: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const q = query.trim();
    if (!q) {
      startTransition(async () => {
        const trending = await getTrendingSymbols();
        setStocks(trending.map(toStockItem));
      });
      return;
    }
    searchTimeout.current = setTimeout(() => {
      startTransition(async () => {
        const results = await searchSymbols(q);
        setStocks(results.map(toStockItem));
      });
    }, 200);
  }, []);

  const groups = useMemo<Group[]>(() => {
    const watchlistStocks = stocks.filter((s) => watchlistTickers.has(s.ticker));
    const otherStocks = stocks.filter((s) => !watchlistTickers.has(s.ticker));

    const result: Group[] = [
      { value: "Pages", items: PAGES },
      { value: "Actions", items: ACTIONS },
    ];

    if (watchlistStocks.length > 0) {
      result.push({ value: "Watchlist", items: watchlistStocks });
    }

    if (otherStocks.length > 0) {
      result.push({ value: "Stocks", items: otherStocks });
    }

    return result;
  }, [watchlistTickers, stocks]);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <MagnifyingGlass />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>
          <Command items={groups}>
            <CommandInput placeholder="Search stocks, pages..." onChange={(e) => handleSearch(e.target.value)} />
            <CommandPanel>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandList>
                {(group: Group) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.value}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: PageItem | StockItem | ActionItem) => {
                          if (isPageItem(item)) {
                            const Icon = item.icon;
                            return (
                              <CommandItem
                                key={item.value}
                                value={item.value}
                                onClick={() => navigate(item.href)}
                              >
                                <Icon size={16} className="opacity-60" />
                                {item.label}
                              </CommandItem>
                            );
                          }
                          if (isStockItem(item)) {
                            const isWatched = watchlistTickers.has(item.ticker);
                            return (
                              <CommandItem
                                key={item.value}
                                value={item.value}
                                onClick={() => navigate(`/stocks/${item.ticker}`)}
                              >
                                {isWatched && <Star size={14} weight="fill" className="text-amber-400" />}
                                <span className="w-12 text-xs font-semibold">{item.ticker}</span>
                                <span className="text-muted-foreground">{item.name}</span>
                              </CommandItem>
                            );
                          }
                          return (
                            <CommandItem
                              key={item.value}
                              value={item.value}
                              onClick={() => navigate("/auth/login")}
                            >
                              <SignOut size={16} className="opacity-60" />
                              {(item as ActionItem).label}
                            </CommandItem>
                          );
                        }}
                      </CommandCollection>
                    </CommandGroup>
                    <CommandSeparator />
                  </Fragment>
                )}
              </CommandList>
            </CommandPanel>
            <CommandFooter>
              <span>Navigate with <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd> keys</span>
              <span>Select with <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd></span>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
