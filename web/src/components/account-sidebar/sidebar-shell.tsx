"use client";

import { useEffect, useState } from "react";
import { SidebarSimple } from "@phosphor-icons/react/ssr";

import { AccountSidebar, type SidebarAccount } from "./account-sidebar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "account-sidebar-collapsed";

export function SidebarShell({
  accounts,
  asOf,
  children,
}: {
  accounts: SidebarAccount[];
  asOf: Date;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the collapsed preference after mount. Server always renders
  // expanded to avoid a hydration mismatch; we flip state if localStorage
  // disagrees. A one-frame flash is the tradeoff for not needing a cookie.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage on mount
      setCollapsed(true);
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // private mode / storage disabled — just keep in-memory state
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
