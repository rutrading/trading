import Link from "next/link";
import {
  ChartLineUp,
  CurrencyBtc,
  Users,
  Plus,
  PencilSimple,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";

type Account = {
  id: number;
  tradingAccount: {
    id: number;
    name: string;
    type: "investment" | "crypto";
    balance: string;
    isJoint: boolean;
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
          return (
            <div key={m.id} className="rounded-xl bg-card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex size-9 items-center justify-center rounded-lg ${
                    acct.type === "investment" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    {acct.type === "investment" ? <ChartLineUp size={18} /> : <CurrencyBtc size={18} />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{acct.name}</p>
                      <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        {acct.type}
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
                <Button variant="ghost" size="icon-xs">
                  <PencilSimple size={14} />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 border-t border-border pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="text-sm font-medium tabular-nums">${fmt(balance)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-sm font-medium tabular-nums">${fmt(balance)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
