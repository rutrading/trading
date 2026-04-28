"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BinocularsIcon,
  BriefcaseIcon,
  ChartLineIcon,
  ClockCounterClockwiseIcon,
  CurrencyCircleDollarIcon,
  CaretUpDownIcon,
  GearSixIcon,
  MoonIcon,
  NewspaperIcon,
  QuestionIcon,
  ReceiptIcon,
  SignOutIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { AccountScopeMenu } from "@/components/sidebar/account-scope-menu";
import { CommandMenu } from "@/components/header/command-menu";
import { authClient } from "@/lib/auth-client";
import type { AccountType } from "@/lib/accounts";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: ChartLineIcon },
  { label: "Portfolio", href: "/portfolio", icon: TrendUpIcon },
  { label: "Holdings", href: "/holdings", icon: BriefcaseIcon },
  { label: "Activity", href: "/activity", icon: ClockCounterClockwiseIcon },
  { label: "Trade", href: "/trade", icon: CurrencyCircleDollarIcon },
  { label: "Orders", href: "/orders", icon: ReceiptIcon },
  { label: "News", href: "/news", icon: NewspaperIcon },
  { label: "Watchlist", href: "/watchlist", icon: BinocularsIcon },
] as const;

type Account = {
  id: number;
  accountId: number;
  userId: string;
  tradingAccount: {
    id: number;
    name: string;
    type: AccountType;
    balance: string;
    isJoint: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
};

export function AppSidebar({
  accounts,
  userName,
  userImage,
}: {
  accounts: Account[];
  userName: string;
  userImage?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const navHref = (href: string) => {
    const account = searchParams.get("account");
    const params = new URLSearchParams();
    if (!account) return href;
    params.set("account", account);
    return `${href}?${params.toString()}`;
  };

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/auth/login");
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="h-14 flex-row items-center px-4">
        <Link href="/" className="font-semibold tracking-tight">
          R U Trading
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <AccountScopeMenu accounts={accounts} />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <CommandMenu trigger="sidebar" />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                const isActive =
                  href === pathname || (href !== "/" && pathname.startsWith(href));
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={label}
                      render={<Link href={navHref(href)} />}
                    >
                      <Icon className="size-4" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Menu>
              <MenuTrigger
                render={
                  <SidebarMenuButton size="lg" tooltip={userName}>
                    {userImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={userImage}
                        alt="Profile"
                        className="size-7 rounded-full"
                      />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full bg-muted text-xs font-semibold">
                        {userName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">{userName}</span>
                    <CaretUpDownIcon className="ms-auto size-3.5" />
                  </SidebarMenuButton>
                }
              />
              <MenuPopup align="start" side="right" className="w-56">
                <MenuGroup>
                  <MenuGroupLabel>Account</MenuGroupLabel>
                  <MenuItem render={<Link href={navHref("/settings")} />}>
                    <GearSixIcon />
                    Settings
                  </MenuItem>
                  <MenuItem render={<Link href={navHref("/faq")} />}>
                    <QuestionIcon />
                    FAQ
                  </MenuItem>
                </MenuGroup>
                <MenuSeparator />
                <MenuCheckboxItem
                  variant="switch"
                  checked={isDark}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                >
                  <MoonIcon />
                  Dark Mode
                </MenuCheckboxItem>
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={handleSignOut}>
                  <SignOutIcon />
                  Sign Out
                </MenuItem>
              </MenuPopup>
            </Menu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
