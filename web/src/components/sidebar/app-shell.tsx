"use client";

import { Header } from "@/components/header/header";
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
  userImage,
  children,
}: {
  accounts: Account[];
  userName: string;
  userImage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Header userName={userName} userImage={userImage} />
          {children}
        </div>
      </div>
    </WebSocketProvider>
  );
}
