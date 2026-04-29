"use client";

import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Page, PageBody } from "@/components/ui/page";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WebSocketProvider } from "@/components/ws-provider";
import type { AccountType } from "@/lib/accounts";

type Account = {
  id: number;
  accountId: number;
  userId: string;
  tradingAccount: {
    id: number;
    name: string;
    type: AccountType;
    balance: string;
    isJoint: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
};

export function AppShell({
  accounts,
  hasKalshiAccount,
  userName,
  userImage,
  children,
}: {
  accounts: Account[];
  hasKalshiAccount: boolean;
  userName: string;
  userImage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <WebSocketProvider>
      <SidebarProvider defaultOpen>
        <AppSidebar
          accounts={accounts}
          hasKalshiAccount={hasKalshiAccount}
          userName={userName}
          userImage={userImage}
        />
        <SidebarInset className="md:peer-data-[variant=inset]:me-0 md:peer-data-[variant=inset]:mb-0 md:peer-data-[variant=inset]:rounded-e-none md:peer-data-[variant=inset]:rounded-b-none">
          <Page className="min-h-screen bg-background text-foreground">
            <PageBody>
              <div className="mx-auto max-w-7xl">
                <SidebarTrigger className="mb-4 md:hidden" />
                {children}
              </div>
            </PageBody>
          </Page>
        </SidebarInset>
      </SidebarProvider>
    </WebSocketProvider>
  );
}
