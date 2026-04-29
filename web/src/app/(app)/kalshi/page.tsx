import type { Metadata } from "next";

import { getKalshiStatus } from "@/app/actions/kalshi";
import { KalshiOnboardingCard } from "@/components/kalshi/onboarding-card";

export const metadata: Metadata = { title: "Kalshi Bot — R U Trading" };

export default async function KalshiPage() {
  // Branch 08 only handles the no-account case. Branch 09 fills in the full
  // dashboard for users with a Kalshi account.
  const status = await getKalshiStatus();

  return (
    <div className="mx-auto max-w-2xl py-12">
      {status.ok ? (
        <div className="rounded-2xl bg-accent p-6">
          <h1 className="text-2xl font-semibold">Kalshi Bot</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Kalshi account is provisioned. The full dashboard ships in the next release.
          </p>
        </div>
      ) : (
        <KalshiOnboardingCard />
      )}
    </div>
  );
}
