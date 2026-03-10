"use client";

import { useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { CreateAccountDialog } from "./create-account-dialog";
import { SearchBar } from "@/components/search-bar";

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
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <SidebarProvider>
      <AppSidebar
        accounts={accounts}
        userName={userName}
        onOpenNewAccount={() => setDialogOpen(true)}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-sidebar-border bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <SearchBar />
        </header>
        <div className="flex-1 overflow-auto px-6 py-4">{children}</div>
      </SidebarInset>
      <CreateAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </SidebarProvider>
  );
}
