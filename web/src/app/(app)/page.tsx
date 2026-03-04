import { Suspense } from "react";
import { getSession, getAccounts } from "@/app/actions/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSummary } from "./account-summary";
import { PositionsPanel } from "./positions-panel";
import { OrdersPanel } from "./orders-panel";
import { BalancesPanel } from "./balances-panel";
import { DashboardTabs } from "./dashboard-tabs";

export const metadata = { title: "R U Trading" };

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {session.user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s an overview of your trading accounts.
        </p>
      </div>

      <DashboardTabs
        summaryPanel={
          <Suspense fallback={<PanelSkeleton />}>
            <AccountSummary />
          </Suspense>
        }
        positionsPanel={
          <Suspense fallback={<PanelSkeleton />}>
            <PositionsPanel />
          </Suspense>
        }
        ordersPanel={
          <Suspense fallback={<PanelSkeleton />}>
            <OrdersPanel />
          </Suspense>
        }
        balancesPanel={
          <Suspense fallback={<PanelSkeleton />}>
            <BalancesPanel />
          </Suspense>
        }
      />
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      <Skeleton className="h-5 w-32" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-border p-6"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
