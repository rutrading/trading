import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/app/actions/orders";
import type { ComponentProps } from "react";

const LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  open: "Open",
  partially_filled: "Partial",
  filled: "Filled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const VARIANTS: Record<OrderStatus, ComponentProps<typeof Badge>["variant"]> = {
  pending: "warning",
  open: "info",
  partially_filled: "warning",
  filled: "success",
  cancelled: "default",
  rejected: "destructive",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => {
  return (
    <Badge variant={VARIANTS[status] ?? "default"}>
      {LABELS[status] ?? status}
    </Badge>
  );
};
