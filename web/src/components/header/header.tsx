"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/hooks/use-media-query";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useTheme } from "next-themes";
import {
  Briefcase,
  ChartLine,
  ClockCounterClockwise,
  CurrencyCircleDollar,
  Newspaper,
  Binoculars,
  GearSix,
  Receipt,
  SignOut,
  Moon,
  List,
  Question,
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
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: ChartLine },
  { label: "Portfolio", href: "/portfolio", icon: Briefcase },
  { label: "Holdings", href: "/holdings", icon: Briefcase },
  { label: "Activity", href: "/activity", icon: ClockCounterClockwise },
  { label: "Trade", href: "/trade", icon: CurrencyCircleDollar },
  { label: "Orders", href: "/orders", icon: Receipt },
  { label: "News", href: "/news", icon: Newspaper },
  { label: "Watchlist", href: "/watchlist", icon: Binoculars },
] as const;

const ALL_TABS = NAV_ITEMS;

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
  const isMobile = useIsMobile();
  const mounted = useIsMounted();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!mounted) return null;

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/auth/login");
  }

  return (
    <header className="mb-8 flex items-center justify-between gap-4">
      <Link
        href="/"
        className="text-xl font-bold tracking-tight"
      >
        R U Trading
      </Link>

      {!isMobile && (
        <Tabs value={active}>
          <TabsList className="bg-transparent *:data-[slot=tab-indicator]:bg-muted *:data-[slot=tab-indicator]:dark:bg-input">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => (
              <TabsTab key={label} value={label} render={<Link href={href} />} nativeButton={false} className="text-foreground/60 data-active:text-foreground">
                <Icon size={16} />
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex items-center gap-3">
        <CommandMenu />
        {isMobile && (
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <List size={20} />
                </Button>
              }
            />
            <SheetContent side="right" className="w-80">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="text-base">R U Trading</SheetTitle>
                <SheetDescription className="text-xs">
                  Signed in as {userName}
                </SheetDescription>
              </SheetHeader>
              <SheetPanel>
                <nav className="flex flex-col gap-0.5 py-2">
                  {ALL_TABS.map(({ label, href, icon: Icon }) => {
                    const isActive =
                      href === pathname ||
                      (href !== "/" && pathname.startsWith(href));
                    return (
                      <SheetClose
                        key={label}
                        nativeButton={false}
                        render={
                          <Link
                            href={href}
                            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-accent text-foreground"
                                : "text-foreground/70 hover:bg-accent/60 hover:text-foreground"
                            }`}
                          >
                            <Icon
                              size={18}
                              weight={isActive ? "fill" : "regular"}
                              className={
                                isActive
                                  ? "text-primary"
                                  : "opacity-70 group-hover:opacity-100"
                              }
                            />
                            {label}
                          </Link>
                        }
                      />
                    );
                  })}
                </nav>
              </SheetPanel>
            </SheetContent>
          </Sheet>
        )}
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
            <MenuGroup>
              <MenuGroupLabel>Account</MenuGroupLabel>
              <MenuItem render={<Link href="/settings" />}>
                <GearSix />
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
                <span className="flex items-center gap-2 [&>svg]:-mx-0.5">
                  <Moon />
                  Dark Mode
                </span>
              </MenuCheckboxItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Help</MenuGroupLabel>
              <MenuItem render={<Link href="/faq" />}>
                <Question />
                FAQ
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={handleSignOut}>
              <SignOut />
              Sign Out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </header>
  );
}
