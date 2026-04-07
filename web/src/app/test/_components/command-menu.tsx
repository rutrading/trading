"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLine,
  Briefcase,
  Newspaper,
  Binoculars,
  GearSix,
  SignOut,
  MagnifyingGlass,
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
  CommandSeparator,
  CommandFooter,
  CommandShortcut,
} from "@/components/ui/command";
import { useAutocompleteFilter } from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";

const PAGES = [
  { label: "Dashboard", href: "/test", icon: ChartLine, keywords: "home overview" },
  { label: "Portfolio", href: "/test/portfolio", icon: Briefcase, keywords: "holdings stocks positions" },
  { label: "News", href: "/test/news", icon: Newspaper, keywords: "articles headlines market" },
  { label: "Watchlist", href: "/test/watchlist", icon: Binoculars, keywords: "tracked favorites saved" },
  { label: "Settings", href: "/test/settings", icon: GearSix, keywords: "account profile preferences" },
];

const STOCKS = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "GOOGL", name: "Alphabet Inc." },
  { ticker: "AMZN", name: "Amazon.com Inc." },
  { ticker: "NVDA", name: "NVIDIA Corporation" },
  { ticker: "MSFT", name: "Microsoft Corporation" },
  { ticker: "META", name: "Meta Platforms Inc." },
  { ticker: "TSLA", name: "Tesla Inc." },
  { ticker: "NFLX", name: "Netflix Inc." },
];

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const filterOptions = useAutocompleteFilter();

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

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
        <MagnifyingGlass size={18} />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>
          <Command filterOptions={filterOptions}>
            <CommandInput placeholder="Search stocks, pages..." />
            <CommandPanel>
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                <CommandGroup>
                  <CommandGroupLabel>Pages</CommandGroupLabel>
                  {PAGES.map((page) => (
                    <CommandItem
                      key={page.href}
                      value={`${page.label} ${page.keywords}`}
                      onClick={() => navigate(page.href)}
                    >
                      <page.icon size={16} className="opacity-60" />
                      {page.label}
                    </CommandItem>
                  ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup>
                  <CommandGroupLabel>Stocks</CommandGroupLabel>
                  {STOCKS.map((stock) => (
                    <CommandItem
                      key={stock.ticker}
                      value={`${stock.ticker} ${stock.name}`}
                      onClick={() => navigate(`/test/stocks/${stock.ticker}`)}
                    >
                      <span className="w-12 text-xs font-semibold">{stock.ticker}</span>
                      <span className="text-muted-foreground">{stock.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup>
                  <CommandGroupLabel>Actions</CommandGroupLabel>
                  <CommandItem value="sign out logout" onClick={() => navigate("/auth/login")}>
                    <SignOut size={16} className="opacity-60" />
                    Sign Out
                  </CommandItem>
                </CommandGroup>
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
