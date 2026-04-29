import Link from "next/link";
import {
  ChartLineUp,
  CurrencyBtc,
  Robot,
  Users,
  Plus,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EditAccountName } from "@/components/settings/edit-account-name";
import { ResetAccount } from "@/components/settings/reset-account";
import { DepositCash } from "@/components/settings/deposit-cash";
import { DeleteAccount } from "@/components/settings/delete-account";
import { CreateKalshiAccountButton } from "@/components/settings/create-kalshi-account";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/lib/accounts";

type Experience = "beginner" | "intermediate" | "advanced" | "expert";

type Account = {
  id: number;
  tradingAccount: {
    id: number;
    name: string;
    type: AccountType;
    balance: string;
    reservedBalance: string;
    isJoint: boolean;
    experienceLevel: Experience;
  };
};

const TYPE_ICON_CLASSES: Record<AccountType, string> = {
  investment: "bg-emerald-500/10 text-emerald-500",
  crypto: "bg-amber-500/10 text-amber-500",
  kalshi: "bg-violet-500/10 text-violet-500",
};

function AccountTypeIcon({ type }: { type: AccountType }) {
  if (type === "investment") return <ChartLineUp />;
  if (type === "crypto") return <CurrencyBtc />;
  return <Robot />;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AccountsList = ({ accounts }: { accounts: Account[] }) => {
  const hasKalshi = accounts.some((m) => m.tradingAccount.type === "kalshi");
  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trading Accounts</h2>
        <div className="flex items-center gap-2">
          <CreateKalshiAccountButton disabled={hasKalshi} />
          <Link href="/onboarding">
            <Button variant="outline" size="sm">
              <Plus size={14} />
              New Account
            </Button>
          </Link>
        </div>
      </div>
      <div className="space-y-3">
        {accounts.map((m) => {
          const acct = m.tradingAccount;
          const isKalshi = acct.type === "kalshi";
          const balance = Number(acct.balance);
          const reserved = Number(acct.reservedBalance);
          const available = balance - reserved;
          return (
            <div key={m.id} className="rounded-xl bg-card p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg sm:size-9 [&_svg]:size-5 sm:[&_svg]:size-[18px]",
                    TYPE_ICON_CLASSES[acct.type],
                  )}
                >
                  <AccountTypeIcon type={acct.type} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate text-base font-semibold leading-none sm:text-sm">
                    {acct.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {acct.type}
                    </span>
                    {!isKalshi && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        {acct.experienceLevel}
                      </span>
                    )}
                    {acct.isJoint && (
                      <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                        <Users size={10} />
                        Joint
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isKalshi ? (
                <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  Managed by the Kalshi bot.{" "}
                  <Link href="/kalshi" className="text-primary hover:underline">
                    Open dashboard
                  </Link>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className="text-sm font-medium tabular-nums">${fmt(available)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-medium tabular-nums">${fmt(balance)}</p>
                  </div>
                </div>
              )}

              <Separator className="my-3" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-nowrap items-center gap-2">
                  <EditAccountName
                    accountId={acct.id}
                    currentName={acct.name}
                  />
                  {!isKalshi && (
                    <>
                      <ResetAccount
                        accountId={acct.id}
                        accountName={acct.name}
                        currentLevel={acct.experienceLevel}
                      />
                      <DepositCash
                        accountId={acct.id}
                        accountName={acct.name}
                      />
                    </>
                  )}
                </div>
                <DeleteAccount
                  accountId={acct.id}
                  accountName={acct.name}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
