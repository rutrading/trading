import Link from "next/link";
import {
  ChartLineUp,
  CurrencyBtc,
  Users,
  Plus,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EditAccountName } from "@/components/settings/edit-account-name";
import { ResetBalance } from "@/components/settings/reset-balance";
import { DeleteAccount } from "@/components/settings/delete-account";
import { cn } from "@/lib/utils";

type Experience = "beginner" | "intermediate" | "advanced" | "expert";

type Account = {
  id: number;
  tradingAccount: {
    id: number;
    name: string;
    type: "investment" | "crypto";
    balance: string;
    reservedBalance: string;
    isJoint: boolean;
    experienceLevel: Experience;
  };
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const AccountsList = ({ accounts }: { accounts: Account[] }) => {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Trading Accounts</h2>
        <Link href="/onboarding">
          <Button variant="outline" size="sm">
            <Plus size={14} />
            New Account
          </Button>
        </Link>
      </div>
      <div className="space-y-3">
        {accounts.map((m) => {
          const acct = m.tradingAccount;
          const balance = Number(acct.balance);
          const reserved = Number(acct.reservedBalance);
          const available = balance - reserved;
          return (
            <div key={m.id} className="rounded-xl bg-card p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg sm:size-9 [&_svg]:size-5 sm:[&_svg]:size-[18px]",
                    acct.type === "investment"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-amber-500/10 text-amber-500",
                  )}
                >
                  {acct.type === "investment" ? <ChartLineUp /> : <CurrencyBtc />}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="truncate text-base font-semibold leading-none sm:text-sm">
                    {acct.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {acct.type}
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {acct.experienceLevel}
                    </span>
                    {acct.isJoint && (
                      <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-500">
                        <Users size={10} />
                        Joint
                      </span>
                    )}
                  </div>
                </div>
              </div>

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

              <Separator className="my-3" />
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <EditAccountName
                    accountId={acct.id}
                    currentName={acct.name}
                  />
                  <ResetBalance
                    accountId={acct.id}
                    accountName={acct.name}
                    currentLevel={acct.experienceLevel}
                  />
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
