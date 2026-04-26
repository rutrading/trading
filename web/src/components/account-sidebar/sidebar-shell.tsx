"use client";

import { useState } from "react";
import { SidebarSimple } from "@phosphor-icons/react/ssr";

import { AccountSidebar, type SidebarAccount } from "./account-sidebar";
import { cn } from "@/lib/utils";

export const SIDEBAR_COLLAPSED_COOKIE = "sidebar-collapsed";

// Roughly one year — long enough to feel persistent without being effectively
// permanent if a user ever clears it.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function SidebarShell({
  accounts,
  asOf,
  children,
  initialCollapsed = false,
}: {
  accounts: SidebarAccount[];
  asOf: string;
  children: React.ReactNode;
  initialCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        document.cookie =
          `${SIDEBAR_COLLAPSED_COOKIE}=${next ? "1" : "0"}; ` +
          `path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
      } catch {
        // private mode / cookies disabled — keep in-memory state
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "grid gap-6",
        collapsed ? "md:grid-cols-[1fr]" : "md:grid-cols-[260px_1fr]",
      )}
    >
      {!collapsed && (
        <AccountSidebar
          accounts={accounts}
          asOf={asOf}
          onToggleCollapse={toggle}
        />
      )}
      <main className="min-w-0">
        {collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Show sidebar"
            className="mb-4 inline-flex items-center gap-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <SidebarSimple size={16} />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
