import { Badge, type BadgeVariant } from "@/components/ui/badge";
import type {
  KalshiOrderStatus,
  KalshiSide,
  KalshiSignalDecision,
} from "@/app/actions/kalshi";

const DECISION_VARIANT: Record<KalshiSignalDecision, BadgeVariant> = {
  emitted: "green",
  dry_run: "blue",
  blocked: "amber",
  skipped: "default",
};

const ORDER_STATUS_VARIANT: Record<KalshiOrderStatus, BadgeVariant> = {
  executed: "green",
  resting: "blue",
  pending: "amber",
  canceled: "default",
  rejected: "red",
};

export function DecisionBadge({ decision }: { decision: KalshiSignalDecision }) {
  return (
    <Badge variant={DECISION_VARIANT[decision]} appearance="soft">
      {decision.replace("_", " ")}
    </Badge>
  );
}

export function OrderStatusBadge({ status }: { status: KalshiOrderStatus }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status]} appearance="soft">
      {status}
    </Badge>
  );
}

export function SideChip({ side }: { side: KalshiSide }) {
  return (
    <Badge variant={side === "yes" ? "green" : "red"} appearance="soft">
      {side.toUpperCase()}
    </Badge>
  );
}
