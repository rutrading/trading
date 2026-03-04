"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartLineUpIcon,
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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

export function AppSidebar({
  accounts,
  userName,
  onOpenNewAccount,
}: {
  accounts: Account[];
  userName: string;
  onOpenNewAccount: () => void;
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
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <ChartLineUpIcon className="size-5" weight="bold" />
          <span className="font-semibold tracking-tight">R U Trading</span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

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
                  <SidebarMenuItem key={a.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/accounts/${a.tradingAccount.id}`}
                      render={
                        <Link href={`/accounts/${a.tradingAccount.id}`} />
                      }
                    >
                      <span className="truncate">
                        {a.tradingAccount.name}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        $
                        {Number(a.tradingAccount.balance).toLocaleString(
                          "en-US",
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        )}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
                  <SidebarMenuItem key={a.id}>
                    <SidebarMenuButton
                      isActive={pathname === `/accounts/${a.tradingAccount.id}`}
                      render={
                        <Link href={`/accounts/${a.tradingAccount.id}`} />
                      }
                    >
                      <span className="truncate">
                        {a.tradingAccount.name}
                      </span>
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        $
                        {Number(a.tradingAccount.balance).toLocaleString(
                          "en-US",
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        )}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onOpenNewAccount}>
                  <PlusIcon className="size-4" />
                  <span>Open a New Account</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                >
                  <ChartLineUpIcon className="size-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
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
