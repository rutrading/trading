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
  Receipt,
  CurrencyCircleDollar,
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
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: ChartLine },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase },
  { label: "Trade", href: "/trade", icon: CurrencyCircleDollar },
  { label: "Orders", href: "/orders", icon: Receipt },
  { label: "News", href: "/news", icon: Newspaper },
  { label: "Watchlist", href: "/watchlist", icon: Binoculars },
] as const;

const SETTINGS_TAB = { label: "Settings", href: "/settings", icon: GearSix } as const;

const ALL_TABS = [...NAV_ITEMS, SETTINGS_TAB];

function getActiveTab(pathname: string) {
  const match = ALL_TABS.find(
    (item) =>
      item.href === pathname ||
      (item.href !== "/" && pathname.startsWith(item.href)),
  );
  return match?.label ?? null;
}

export function Header({ userName, userImage }: { userName: string; userImage?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = getActiveTab(pathname);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center">
      <Link
        href="/"
        className="justify-self-start text-xl font-bold tracking-tight"
      >
        <span className="md:hidden">RU</span>
        <span className="hidden md:inline">R U Trading</span>
      </Link>

      <Tabs value={active}>
        <TabsList className="bg-transparent *:data-[slot=tab-indicator]:bg-muted *:data-[slot=tab-indicator]:dark:bg-input">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
            <TabsTab key={label} value={label} render={<Link href={href} />} nativeButton={false} className="text-foreground/60 data-active:text-foreground">
              <Icon size={16} />
              {label}
            </TabsTab>
          ))}
          <TabsTab
            key={SETTINGS_TAB.label}
            value={SETTINGS_TAB.label}
            render={<Link href={SETTINGS_TAB.href} />}
            nativeButton={false}
            className="hidden md:inline-flex text-foreground/60 data-active:text-foreground"
          >
            <GearSix size={16} />
            Settings
          </TabsTab>
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-3 justify-self-end">
        <CommandMenu />
        <Menu>
          <MenuTrigger className="cursor-pointer">
            {userImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={userImage}
                alt="Profile"
                className="size-8 rounded-full transition-opacity hover:opacity-80"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold transition-opacity hover:opacity-80">
                {userName.charAt(0).toUpperCase()}
              </div>
            )}
          </MenuTrigger>
          <MenuPopup align="end" sideOffset={8} className="w-52">
            <div className="px-3 py-2">
              <p className="text-sm font-medium">{userName}</p>
            </div>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Account</MenuGroupLabel>
              <MenuItem render={<Link href="/settings" />}>
                <GearSix size={16} />
                Settings
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
            <MenuItem onClick={handleSignOut}>
              <SignOut size={16} />
              Sign Out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </header>
  );
}
