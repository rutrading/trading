import type { Metadata } from "next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { isKalshiEnabled } from "@/lib/kalshi-enabled";
import { KalshiOnboardingCard } from "@/components/kalshi/onboarding-card";
import { KalshiStatusCard } from "@/components/kalshi/status-card";
import { KalshiControlPanel } from "@/components/kalshi/control-panel";
import { KalshiSignalsTable } from "@/components/kalshi/signals-table";
import { KalshiOrdersTable } from "@/components/kalshi/orders-table";
import { KalshiPositionsTable } from "@/components/kalshi/positions-table";
import { KalshiFillsTable } from "@/components/kalshi/fills-table";
import { KalshiAutoRefresh } from "@/components/kalshi/auto-refresh";
import {
  getKalshiStatus,
  getKalshiSignals,
  getKalshiOrders,
  getKalshiPositions,
  getKalshiFills,
} from "@/app/actions/kalshi";

export const metadata: Metadata = { title: "Kalshi Bot — R U Trading" };

// FastAPI's 404 detail surfaced through lib/api as a plain string. The brief's
// `includes("404")` check would never match — match the detail text instead.
const NO_ACCOUNT_DETAIL = "No Kalshi account for this user";

export default async function KalshiPage() {
  if (!isKalshiEnabled()) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="rounded-2xl bg-accent p-8 text-center">
          <h1 className="text-xl font-semibold">Kalshi service disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The Kalshi integration is turned off in this environment. Contact
            an administrator if you expected it to be available.
          </p>
        </div>
      </div>
    );
  }

  const statusRes = await getKalshiStatus();

  if (!statusRes.ok) {
    if (statusRes.error === NO_ACCOUNT_DETAIL) {
      return (
        <div className="mx-auto max-w-2xl py-12">
          <KalshiOnboardingCard />
        </div>
      );
    }
    return (
      <div className="space-y-8">
        <Alert variant="error">
          <AlertDescription>
            Could not load Kalshi bot status. The backend may be down or restarting.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [signalsRes, ordersRes, positionsRes, fillsRes] = await Promise.all([
    getKalshiSignals({ limit: 20 }),
    getKalshiOrders({ limit: 20 }),
    getKalshiPositions(),
    getKalshiFills({ limit: 20 }),
  ]);

  const signals = signalsRes.ok ? signalsRes.data : [];
  const orders = ordersRes.ok ? ordersRes.data : [];
  const positions = positionsRes.ok ? positionsRes.data : [];
  const fills = fillsRes.ok ? fillsRes.data : [];

  const { account, bot_state } = statusRes.data;

  const automationLabel = !bot_state.automation_enabled
    ? "automation: off"
    : bot_state.paused
      ? "automation: paused"
      : "automation: active";

  return (
    <div className="space-y-8">
      <KalshiAutoRefresh />

      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Kalshi Bot</h1>
        <p className="text-sm text-muted-foreground">
          {account.subaccount_number !== null
            ? `Subaccount #${account.subaccount_number} · `
            : ""}
          {bot_state.active_strategy} · {automationLabel}
          {bot_state.dry_run ? " · dry-run" : ""}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <KalshiStatusCard account={account} botState={bot_state} />
        <KalshiControlPanel botState={bot_state} />
      </div>

      <KalshiSignalsTable signals={signals} />
      <KalshiOrdersTable orders={orders} />

      <div className="grid gap-8 lg:grid-cols-2">
        <KalshiPositionsTable positions={positions} />
        <KalshiFillsTable fills={fills} />
      </div>
    </div>
  );
}
