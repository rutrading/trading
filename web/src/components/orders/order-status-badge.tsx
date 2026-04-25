import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/app/actions/orders";

const LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  open: "Open",
  partially_filled: "Partial",
  filled: "Filled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const VARIANTS: Record<OrderStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  pending: "warning",
  open: "info",
  partially_filled: "warning",
  filled: "success",
  cancelled: "secondary",
  rejected: "error",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => {
  return (
    <Badge variant={VARIANTS[status] ?? "secondary"} size="sm">
      {LABELS[status] ?? status}
    </Badge>
  );
};
