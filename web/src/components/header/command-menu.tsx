"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLine,
  Briefcase,
  ClockCounterClockwise,
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
import { listSymbols, type PagedSymbols } from "@/app/actions/symbols";
import { authClient } from "@/lib/auth-client";
import { useIsMounted } from "@/hooks/use-is-mounted";

interface PageItem {
  kind: "page";
  value: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface ActionItem {
  kind: "action";
  value: string;
  label: string;
}

interface StockItem {
  kind: "stock";
  value: string;
  ticker: string;
  name: string;
}

type GroupItem = PageItem | ActionItem | StockItem;

interface Group {
  value: string;
  items: GroupItem[];
}

const PAGES: PageItem[] = [
  { kind: "page", value: "dashboard home overview", label: "Dashboard", href: "/", icon: ChartLine },
  { kind: "page", value: "portfolio chart performance allocation", label: "Portfolio", href: "/portfolio", icon: ChartLine },
  { kind: "page", value: "holdings positions stocks", label: "Holdings", href: "/holdings", icon: Briefcase },
  { kind: "page", value: "activity transactions history", label: "Activity", href: "/activity", icon: ClockCounterClockwise },
  { kind: "page", value: "news articles headlines market", label: "News", href: "/news", icon: Newspaper },
  { kind: "page", value: "watchlist tracked favorites saved", label: "Watchlist", href: "/watchlist", icon: Binoculars },
  { kind: "page", value: "settings account profile preferences", label: "Settings", href: "/settings", icon: GearSix },
];

const ACTIONS: ActionItem[] = [
  { kind: "action", value: "sign out logout", label: "Sign Out" },
];

const PAGE_SIZE = 25;
const LOAD_MORE_THRESHOLD_PX = 300;

function toStockItem(s: { ticker: string; name: string }): StockItem {
  return {
    kind: "stock",
    value: `${s.ticker.toLowerCase()} ${s.name.toLowerCase()}`,
    ticker: s.ticker,
    name: s.name,
  };
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const router = useRouter();
  const mounted = useIsMounted();

  const queryRef = useRef("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);
  const requestIdRef = useRef(0);
  const loadMoreRef = useRef<() => void>(() => {});
  const inFlightRef = useRef(false);

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

  const loadPage = useCallback(async (q: string, offset: number) => {
    const rid = ++requestIdRef.current;
    const page: PagedSymbols = await listSymbols({
      query: q,
      limit: PAGE_SIZE,
      offset,
    });
    if (rid !== requestIdRef.current) return;
    const mapped = page.items.map(toStockItem);
    setStocks((prev) => {
      if (offset === 0) return mapped;
      const seen = new Set(prev.map((s) => s.ticker));
      const fresh = mapped.filter((s) => !seen.has(s.ticker));
      return fresh.length === 0 ? prev : [...prev, ...fresh];
    });
    setHasMore(page.hasMore);
  }, []);

  // Warm the cache once on mount — stocks + watchlist persist across opens so
  // toggling the dialog doesn't re-fetch.
  useEffect(() => {
    getWatchlist().then((res) => {
      if (res.ok) {
        setWatchlistTickers(new Set(res.data.watchlist.map((w) => w.ticker)));
      }
    });
    loadPage("", 0);
  }, [loadPage]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await authClient.signOut();
    router.push("/auth/login");
  }, [router]);

  const handleSearch = useCallback(
    (value: string) => {
      queryRef.current = value;
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        loadPage(value.trim(), 0);
      }, 200);
    },
    [loadPage],
  );

  const loadMore = useCallback(async () => {
    if (inFlightRef.current || !hasMore) return;
    inFlightRef.current = true;
    try {
      await loadPage(queryRef.current.trim(), stocks.length);
    } finally {
      inFlightRef.current = false;
    }
  }, [hasMore, loadPage, stocks.length]);

  // Keep a ref to the latest loadMore so the scroll handler always sees it.
  loadMoreRef.current = loadMore;

  const attachViewport = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const el = node;
    let lastScrollTop = el.scrollTop;
    function onScroll() {
      const prev = lastScrollTop;
      const cur = el.scrollTop;
      lastScrollTop = cur;
      // Only consider scrolling DOWN. Prevents repeated triggers when the
      // user sits at the bottom and the scroll event fires from layout
      // shifts as new items append.
      if (cur <= prev) return;
      if (
        el.scrollHeight - cur - el.clientHeight <
        LOAD_MORE_THRESHOLD_PX
      ) {
        loadMoreRef.current();
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const starred = stocks.filter((s) => watchlistTickers.has(s.ticker));
  const rest = stocks.filter((s) => !watchlistTickers.has(s.ticker));

  const groups: Group[] = [
    { value: "Pages", items: PAGES },
    { value: "Actions", items: ACTIONS },
  ];
  if (starred.length > 0) groups.push({ value: "Watchlist", items: starred });
  if (rest.length > 0) groups.push({ value: "Stocks", items: rest });

  if (!mounted) return null;

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <MagnifyingGlass />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>
          <Command items={groups}>
            <CommandInput
              placeholder="Search stocks, pages..."
              onChange={(e) => handleSearch(e.target.value)}
            />
            <CommandPanel>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandList viewportRef={attachViewport}>
                {(group: Group) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.value}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: GroupItem) => {
                          if (item.kind === "page") {
                            const Icon = item.icon;
                            return (
                              <CommandItem
                                key={item.value}
                                value={item.value}
                                onClick={() => navigate(item.href)}
                              >
                                <span className="inline-flex size-4 shrink-0 items-center justify-center">
                                  <Icon size={16} className="opacity-60" />
                                </span>
                                <span>{item.label}</span>
                              </CommandItem>
                            );
                          }
                          if (item.kind === "action") {
                            return (
                              <CommandItem
                                key={item.value}
                                value={item.value}
                                onClick={handleSignOut}
                                className="text-destructive-foreground data-highlighted:bg-destructive/12 data-highlighted:text-destructive-foreground"
                              >
                                <span className="inline-flex size-4 shrink-0 items-center justify-center">
                                  <SignOut size={16} />
                                </span>
                                <span>{item.label}</span>
                              </CommandItem>
                            );
                          }
                          const isWatched = watchlistTickers.has(item.ticker);
                          return (
                            <CommandItem
                              key={item.ticker}
                              value={item.value}
                              onClick={() => navigate(`/stocks/${item.ticker}`)}
                            >
                              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                                {isWatched && (
                                  <Star
                                    size={14}
                                    weight="fill"
                                    className="text-amber-400"
                                  />
                                )}
                              </span>
                              <span className="w-20 shrink-0 truncate text-xs font-semibold tabular-nums">
                                {item.ticker}
                              </span>
                              <span className="truncate text-muted-foreground">
                                {item.name}
                              </span>
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
              <span className="flex items-center gap-1.5">
                Navigate with
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑</kbd>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↓</kbd>
                keys
              </span>
              <span className="flex items-center gap-1.5">
                Select with
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↵</kbd>
              </span>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}
