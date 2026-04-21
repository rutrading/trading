"use client";

import { useEffect, useState } from "react";

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
        "grid gap-6 md:grid-cols-[260px_1fr]",
        collapsed && "md:grid-cols-[56px_1fr]",
      )}
    >
      <AccountSidebar
        accounts={accounts}
        asOf={asOf}
        collapsed={collapsed}
        onToggleCollapse={toggle}
      />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
