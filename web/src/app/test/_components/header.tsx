"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Briefcase,
  ChartLine,
  Newspaper,
  Binoculars,
  GearSix,
  SignOut,
  User,
  Moon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { CommandMenu } from "./command-menu";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuGroupLabel,
  MenuGroup,
} from "@/components/ui/menu";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/test", icon: ChartLine },
  { label: "Portfolio", href: "/test/portfolio", icon: Briefcase },
  { label: "News", href: "/test/news", icon: Newspaper },
  { label: "Watchlist", href: "/test/watchlist", icon: Binoculars },
] as const;

const SETTINGS_TAB = { label: "Settings", href: "/test/settings", icon: GearSix } as const;

const ALL_TABS = [...NAV_ITEMS, SETTINGS_TAB];

function getActiveTab(pathname: string) {
  const match = ALL_TABS.find(
    (item) =>
      item.href === pathname ||
      (item.href !== "/test" && pathname.startsWith(item.href)),
  );
  return match?.label ?? "Dashboard";
}

export function Header() {
  const pathname = usePathname();
  const active = getActiveTab(pathname);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center">
      <Link
        href="/test"
        className="justify-self-start text-xl font-bold tracking-tight"
      >
        <span className="md:hidden">RU</span>
        <span className="hidden md:inline">R U Trading</span>
      </Link>

      <Tabs value={active}>
        <TabsList className="bg-transparent">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <TabsTab key={label} value={label} render={<Link href={href} />} nativeButton={false}>
              <Icon size={16} />
              {label}
            </TabsTab>
          ))}
          <TabsTab
            key={SETTINGS_TAB.label}
            value={SETTINGS_TAB.label}
            render={<Link href={SETTINGS_TAB.href} />}
            nativeButton={false}
            className="hidden md:inline-flex"
          >
            <GearSix size={16} />
            Settings
          </TabsTab>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3 justify-self-end">
        <CommandMenu />
        <div className="hidden text-xs md:block">
          <span className="text-muted-foreground">Value </span>
          <span className="font-medium">$100K-$150K</span>
          <br />
          <span className="text-muted-foreground">Cash </span>
          <span className="font-semibold">$500,000</span>
        </div>
        <Menu>
          <MenuTrigger className="cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://github.com/kylegrahammatzen.png"
              alt="Profile"
              className="size-8 rounded-full transition-opacity hover:opacity-80"
            />
          </MenuTrigger>
          <MenuPopup align="end" sideOffset={8} className="w-52">
            <div className="px-3 py-2 md:hidden">
              <p className="text-sm font-medium">Kyle</p>
              <div className="mt-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Value </span>
                  <span className="font-medium">$100K-$150K</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Cash </span>
                  <span className="font-semibold">$500,000</span>
                </div>
              </div>
            </div>
            <MenuSeparator className="md:hidden" />
            <MenuGroup>
              <MenuGroupLabel>Account</MenuGroupLabel>
              <MenuItem render={<Link href="/test/settings" />}>
                <GearSix size={16} />
                Settings
              </MenuItem>
              <MenuItem>
                <User size={16} />
                Profile
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Preferences</MenuGroupLabel>
              <MenuCheckboxItem
                variant="switch"
                checked={isDark}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
              >
                <span className="inline-flex items-center gap-2">
                  <Moon size={16} className="opacity-80" />
                  Dark Mode
                </span>
              </MenuCheckboxItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem>
              <SignOut size={16} />
              Sign Out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </header>
  );
}
