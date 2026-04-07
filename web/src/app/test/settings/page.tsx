import type { Metadata } from "next";
import {
  ChartLineUp,
  CurrencyBtc,
  Users,
  Plus,
  PencilSimple,
} from "@phosphor-icons/react/ssr";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Settings - R U Trading" };

const TRADING_ACCOUNTS = [
  {
    id: 1,
    name: "Main Portfolio",
    type: "investment" as const,
    balance: 50000,
    reservedBalance: 2400,
    isJoint: false,
    members: [{ name: "Kyle", email: "kyle@example.com" }],
    createdAt: "2026-01-15",
  },
  {
    id: 2,
    name: "Crypto Wallet",
    type: "crypto" as const,
    balance: 15000,
    reservedBalance: 800,
    isJoint: false,
    members: [{ name: "Kyle", email: "kyle@example.com" }],
    createdAt: "2026-02-03",
  },
  {
    id: 3,
    name: "Joint Account",
    type: "investment" as const,
    balance: 75000,
    reservedBalance: 5200,
    isJoint: true,
    members: [
      { name: "Kyle", email: "kyle@example.com" },
      { name: "Nitin", email: "nitin@example.com" },
    ],
    createdAt: "2026-03-01",
  },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and account.
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-8">
        <div className="rounded-2xl bg-accent p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Trading Accounts</h2>
            <Button variant="outline" size="sm">
              <Plus size={14} />
              New Account
            </Button>
          </div>
          <div className="space-y-3">
            {TRADING_ACCOUNTS.map((acct) => (
              <div key={acct.id} className="rounded-xl bg-card p-4">
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Created {acct.createdAt}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-xs">
                    <PencilSimple size={14} />
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-4 border-t border-border pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className="text-sm font-medium tabular-nums">${fmt(acct.balance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reserved</p>
                    <p className="text-sm font-medium tabular-nums">${fmt(acct.reservedBalance)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-medium tabular-nums">${fmt(acct.balance + acct.reservedBalance)}</p>
                  </div>
                </div>

                {acct.isJoint && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs text-muted-foreground">Members</p>
                    <div className="flex flex-wrap gap-2">
                      {acct.members.map((m) => (
                        <span key={m.email} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          {m.name}
                        </span>
                      ))}
                      <button className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
                        <Plus size={10} />
                        Invite
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Profile</h2>
          <div className="space-y-4 rounded-xl bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" defaultValue="Kyle" />
            </div>
            <Button size="sm">Update Name</Button>
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Email</h2>
          <div className="space-y-4 rounded-xl bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" defaultValue="kyle@example.com" />
            </div>
            <Button size="sm">Update Email</Button>
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Security</h2>
          <div className="space-y-4 rounded-xl bg-card p-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input id="current-password" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" />
            </div>
            <Button size="sm">Change Password</Button>
          </div>
        </div>

        <div className="rounded-2xl bg-accent p-6">
          <h2 className="mb-4 text-lg font-semibold">Account</h2>
          <div className="space-y-4 rounded-xl bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Reset Balance</p>
                <p className="text-xs text-muted-foreground">
                  Restore your virtual cash to the default amount.
                </p>
              </div>
              <Button variant="outline" size="sm">
                Reset
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently remove your account and all data.
                </p>
              </div>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
