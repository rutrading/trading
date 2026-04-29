"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Robot } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { createKalshiAccount } from "@/app/actions/auth";
import { toast } from "@/lib/toasts";

export function KalshiOnboardingCard() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="rounded-2xl bg-accent p-8 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Robot size={24} weight="duotone" />
      </div>
      <h1 className="mt-4 text-xl font-semibold">No Kalshi account yet</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Create one to enable the BTC hourly trading bot. Dry-run is on by default.
      </p>
      <Button
        className="mt-6"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await createKalshiAccount("My Kalshi Account");
            if (!result.success) {
              toast.error("Could not create Kalshi account", result.error);
              return;
            }
            toast.success("Kalshi account created");
            router.refresh();
          })
        }
      >
        {pending ? "Creating..." : "Create Kalshi Account"}
      </Button>
    </div>
  );
}
