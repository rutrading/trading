"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { GearSix, SidebarSimple } from "@phosphor-icons/react/ssr";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BrokerageAccountType } from "@/lib/accounts";

export type SidebarAccount = {
  id: number;
  name: string;
  type: BrokerageAccountType;
  balance: string;
  isJoint: boolean;
};

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function AccountSidebar({
  accounts,
  asOf,
  onToggleCollapse,
}: {
  accounts: SidebarAccount[];
  // Pre-formatted on the server. Passing a Date and formatting here would
  // hydration-mismatch because Node's and the browser's ICU disagree on
  // separators ("Apr 21, 2026, 12:59" vs "Apr 21, 2026 at 12:59").
  asOf: string;
  onToggleCollapse: () => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeParam = searchParams.get("account");

  const buildHref = (accountId: number | "all") => {
    const next = new URLSearchParams(searchParams.toString());
    if (accountId === "all") {
      next.delete("account");
    } else {
      next.set("account", String(accountId));
    }
    // Drop pagination when switching accounts — first page of the new scope.
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const isAllActive = !activeParam || activeParam === "all";
  const activeId = !isAllActive ? Number(activeParam) : null;

  const investment = accounts.filter((a) => a.type === "investment");
  const crypto = accounts.filter((a) => a.type === "crypto");

  return (
    <aside className="rounded-2xl bg-accent p-4">
      <header className="mb-4 flex items-center justify-between px-2 pt-2">
        <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Link
            href="/settings"
            aria-label="Account settings"
            className="rounded-md p-1.5 transition-colors hover:bg-card hover:text-foreground"
          >
            <GearSix size={16} />
          </Link>
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={onToggleCollapse}
            className="rounded-md p-1.5 transition-colors hover:bg-card hover:text-foreground"
          >
            <SidebarSimple size={16} />
          </button>
        </div>
      </header>

      <p className="mb-4 px-2 text-xs text-muted-foreground">
        As of {asOf}
      </p>

      <Link
        href={buildHref("all")}
        className={cn(
          "block rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
          isAllActive
            ? "border-border bg-card"
            : "border-transparent hover:bg-card/60",
        )}
      >
        All accounts
      </Link>

      {investment.length > 0 && (
        <Section
          label="Investment"
          accounts={investment}
          activeId={activeId}
          buildHref={buildHref}
        />
      )}

      {crypto.length > 0 && (
        <Section
          label="Cryptocurrency"
          accounts={crypto}
          activeId={activeId}
          buildHref={buildHref}
        />
      )}
    </aside>
  );
}

function Section({
  label,
  accounts,
  activeId,
  buildHref,
}: {
  label: string;
  accounts: SidebarAccount[];
  activeId: number | null;
  buildHref: (id: number | "all") => string;
}) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
      <ul className="space-y-1">
        {accounts.map((a) => {
          const active = a.id === activeId;
          return (
            <li key={a.id}>
              <Link
                href={buildHref(a.id)}
                className={cn(
                  "block rounded-xl border-l-2 px-4 py-2.5 transition-colors",
                  active
                    ? "border-l-primary bg-card"
                    : "border-l-transparent hover:bg-card/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  {a.isJoint && (
                    <Badge variant="default">
                      Joint
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  ${fmtCurrency(parseFloat(a.balance))}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
