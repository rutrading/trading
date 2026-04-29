import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProvisionSubaccountButton } from "@/components/kalshi/provision-button";
import { RelativeTime } from "@/components/kalshi/relative-time";
import type {
  KalshiAccountInfo,
  KalshiAccountStatus,
  KalshiBotStateInfo,
} from "@/app/actions/kalshi";

const STATUS_VARIANT: Record<KalshiAccountStatus, BadgeVariant> = {
  local_only: "default",
  active: "green",
  failed: "red",
};

const STATUS_LABEL: Record<KalshiAccountStatus, string> = {
  local_only: "Local only",
  active: "Active",
  failed: "Failed",
};

function formatBalance(value: string | null): string {
  if (value === null) return "—";
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export function KalshiStatusCard({
  account,
  botState,
}: {
  account: KalshiAccountInfo;
  botState: KalshiBotStateInfo;
}) {
  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Status</h2>
      <div className="space-y-3">
        <Row label="Subaccount">
          {account.subaccount_number !== null ? (
            <span className="font-mono text-sm">#{account.subaccount_number}</span>
          ) : (
            <span className="text-muted-foreground">Not provisioned</span>
          )}
        </Row>
        <Row label="Status">
          <Badge variant={STATUS_VARIANT[account.status]} appearance="soft">
            {STATUS_LABEL[account.status]}
          </Badge>
        </Row>
        <Row label="Last balance">
          <span className="tabular-nums">{formatBalance(account.last_balance_dollars)}</span>
        </Row>
        <Row label="Active strategy">{botState.active_strategy}</Row>
        <Row label="Last cycle">
          {botState.last_cycle_at ? (
            <RelativeTime iso={botState.last_cycle_at} />
          ) : (
            <span className="text-muted-foreground">Never</span>
          )}
        </Row>
        {botState.last_error && (
          <Row label="Last error">
            <span
              className="block max-w-[28ch] truncate text-rose-700 dark:text-rose-300"
              title={botState.last_error}
            >
              {botState.last_error}
            </span>
          </Row>
        )}
      </div>

      {account.status === "local_only" && (
        <div className="mt-6">
          <ProvisionSubaccountButton label="Provision subaccount" />
        </div>
      )}
      {account.status === "failed" && (
        <div className="mt-6 space-y-3">
          {account.provisioning_error && (
            <Alert variant="error">
              <AlertDescription>{account.provisioning_error}</AlertDescription>
            </Alert>
          )}
          <ProvisionSubaccountButton label="Retry provisioning" />
        </div>
      )}
    </div>
  );
}
