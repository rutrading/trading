"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BankIcon, CaretUpDownIcon } from "@phosphor-icons/react";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

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

export function AccountScopeMenu({ accounts }: { accounts: Account[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeAccount = searchParams.get("account");
  const selectedAccount = accounts.find(
    (account) => String(account.tradingAccount.id) === activeAccount,
  );

  const investmentAccounts = accounts.filter(
    (account) =>
      account.tradingAccount.type === "investment" &&
      String(account.tradingAccount.id) !== activeAccount,
  );
  const cryptoAccounts = accounts.filter(
    (account) =>
      account.tradingAccount.type === "crypto" &&
      String(account.tradingAccount.id) !== activeAccount,
  );

  const scopedHref = (accountId: number | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (accountId === null) next.delete("account");
    else next.set("account", String(accountId));
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <SidebarMenuButton size="lg" tooltip="Account scope">
            <BankIcon className="size-4" />
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-medium">
                {selectedAccount?.tradingAccount.name ?? "Select account"}
              </span>
              {selectedAccount ? (
                <span className="truncate text-xs text-muted-foreground">
                  ${formatBalance(selectedAccount.tradingAccount.balance)}
                </span>
              ) : null}
            </div>
            <CaretUpDownIcon className="ms-auto size-3.5" />
          </SidebarMenuButton>
        }
      />
      <MenuPopup align="start" side="right" className="w-72">
        {investmentAccounts.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel>Investment</MenuGroupLabel>
            {investmentAccounts.map((account) => (
              <MenuItem
                key={account.id}
                render={<Link href={scopedHref(account.tradingAccount.id)} />}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{account.tradingAccount.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ${formatBalance(account.tradingAccount.balance)}
                  </span>
                </span>
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {cryptoAccounts.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel>Crypto</MenuGroupLabel>
            {cryptoAccounts.map((account) => (
              <MenuItem
                key={account.id}
                render={<Link href={scopedHref(account.tradingAccount.id)} />}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{account.tradingAccount.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ${formatBalance(account.tradingAccount.balance)}
                  </span>
                </span>
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {activeAccount ? (
          <>
            <MenuSeparator />
            <MenuItem variant="destructive" render={<Link href={scopedHref(null)} />}>
              Clear selection
            </MenuItem>
          </>
        ) : null}
        <MenuSeparator />
        <MenuItem render={<Link href="/onboarding" />}>
          Open a New Account
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
