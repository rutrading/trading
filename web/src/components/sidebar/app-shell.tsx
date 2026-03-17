"use client";

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { SearchBar } from "@/components/search-bar";
import { WebSocketProvider } from "@/components/ws-provider";

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

export function AppShell({
  accounts,
  userName,
  children,
}: {
  accounts: Account[];
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <WebSocketProvider>
      <SidebarProvider>
        <AppSidebar accounts={accounts} userName={userName} />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-sidebar-border bg-background px-4">
            <SidebarTrigger className="-ml-1" />
            <SearchBar />
          </header>
          <div className="flex-1 overflow-auto px-6 py-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </WebSocketProvider>
  );
}
