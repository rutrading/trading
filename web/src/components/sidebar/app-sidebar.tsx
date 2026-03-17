"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GearSixIcon,
  PlusIcon,
  CurrencyCircleDollarIcon,
  BankIcon,
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
import { SignOutButton } from "@/components/sign-out-button";

type Account = {
  id: number;
  accountId: number;
  userId: string;
  tradingAccount: {
    id: number;
    name: string;
    type: "investment" | "crypto";
    balance: string;
    isJoint: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
};

function formatBalance(balance: string) {
  return Number(balance).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AccountItem({
  account,
  isActive,
}: {
  account: Account;
  isActive: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={isActive}
        render={<Link href={`/accounts/${account.tradingAccount.id}`} />}
      >
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {account.tradingAccount.name}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            ${formatBalance(account.tradingAccount.balance)}
          </span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar({
  accounts,
  userName,
}: {
  accounts: Account[];
  userName: string;
}) {
  const pathname = usePathname();

  const investmentAccounts = accounts.filter(
    (a) => a.tradingAccount.type === "investment",
  );
  const cryptoAccounts = accounts.filter(
    (a) => a.tradingAccount.type === "crypto",
  );

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex-row items-center border-b border-sidebar-border px-4">
        <Link href="/" className="font-semibold tracking-tight">
          R U Trading
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {investmentAccounts.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <BankIcon className="size-4" />
              <span className="ml-1">Investment</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {investmentAccounts.map((a) => (
                  <AccountItem
                    key={a.id}
                    account={a}
                    isActive={pathname === `/accounts/${a.tradingAccount.id}`}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {cryptoAccounts.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <CurrencyCircleDollarIcon className="size-4" />
              <span className="ml-1">Crypto</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {cryptoAccounts.map((a) => (
                  <AccountItem
                    key={a.id}
                    account={a}
                    isActive={pathname === `/accounts/${a.tradingAccount.id}`}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/onboarding" />}>
                  <PlusIcon className="size-4" />
                  <span>Open a New Account</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/settings"}
              render={<Link href="/settings" />}
            >
              <GearSixIcon className="size-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-between px-2">
          <span className="truncate text-sm text-muted-foreground">
            {userName}
          </span>
          <SignOutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
