"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  setBotControl,
  setBotStrategy,
  type KalshiBotStateInfo,
} from "@/app/actions/kalshi";
import { toast } from "@/lib/toasts";

const STRATEGIES = ["threshold_drift", "momentum", "mean_reversion"] as const;

type ControlPayload = {
  automation_enabled?: boolean;
  paused?: boolean;
  dry_run?: boolean;
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function KalshiControlPanel({
  botState,
}: {
  botState: KalshiBotStateInfo;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmOff, setConfirmOff] = useState(false);

  const isLive = botState.automation_enabled && !botState.paused;

  function update(payload: ControlPayload) {
    start(async () => {
      const res = await setBotControl(payload);
      if (!res.success) {
        toast.error("Update failed", res.error);
        return;
      }
      router.refresh();
    });
  }

  function changeStrategy(strategy: string | null) {
    if (!strategy || strategy === botState.active_strategy) return;
    start(async () => {
      const res = await setBotStrategy(strategy);
      if (!res.success) {
        toast.error("Strategy update failed", res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="text-lg font-semibold">Controls</h2>
      <div className="mt-4 space-y-4">
        <Row
          label="Automation enabled"
          hint="Master switch for the trading loop."
        >
          <Switch
            checked={botState.automation_enabled}
            disabled={pending}
            onCheckedChange={(v) => update({ automation_enabled: v })}
          />
        </Row>
        <Row label="Paused" hint="Skip cycles without flipping automation off.">
          <Switch
            checked={botState.paused}
            disabled={pending}
            onCheckedChange={(v) => update({ paused: v })}
          />
        </Row>
        <Row
          label="Dry-run"
          hint="Record signals without submitting orders to Kalshi."
        >
          <Switch
            checked={botState.dry_run}
            disabled={pending}
            onCheckedChange={(v) => {
              if (botState.dry_run && !v) {
                setConfirmOff(true);
                return;
              }
              update({ dry_run: v });
            }}
          />
        </Row>
        <Row
          label="Active strategy"
          hint={
            isLive
              ? "Pause the bot to switch strategies."
              : "Used on the next cycle."
          }
        >
          <Select
            value={botState.active_strategy}
            disabled={pending || isLive}
            onValueChange={changeStrategy}
          >
            <SelectTrigger size="sm">
              <SelectValue>{(value) => value || "Select"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {STRATEGIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Row>
      </div>

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off dry-run?</AlertDialogTitle>
            <AlertDialogDescription>
              Real demo orders will start being submitted to Kalshi. This requires a
              provisioned subaccount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOff(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmOff(false);
                update({ dry_run: false });
              }}
              disabled={pending}
            >
              Turn off dry-run
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
