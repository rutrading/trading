import Link from "next/link";
import { ListChecks } from "@phosphor-icons/react/ssr";
import type { Order } from "@/app/actions/orders";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pending",
  open: "Open",
  partially_filled: "Partial",
  filled: "Filled",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const OpenOrdersList = ({
  orders,
  accountsById,
}: {
  orders: Order[];
  accountsById?: Record<number, { name: string }>;
}) => {
  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks />
          </EmptyMedia>
          <EmptyTitle>No open orders</EmptyTitle>
          <EmptyDescription>
            Pending and working orders will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-1">
      {orders.map((o) => {
        const qty = parseFloat(o.quantity);
        const accountName = accountsById?.[o.trading_account_id]?.name;
        const priceLabel =
          o.order_type === "market"
            ? "Market"
            : o.order_type === "limit" && o.limit_price
              ? `Limit @ $${fmt(parseFloat(o.limit_price))}`
              : o.order_type === "stop" && o.stop_price
                ? `Stop @ $${fmt(parseFloat(o.stop_price))}`
                : o.order_type === "stop_limit" && o.stop_price && o.limit_price
                  ? `Stop $${fmt(parseFloat(o.stop_price))} → Limit $${fmt(parseFloat(o.limit_price))}`
                  : o.order_type;
        return (
          <Link
            key={o.id}
            href={`/orders?account=${o.trading_account_id}`}
            className="flex items-center justify-between rounded-xl bg-card px-4 py-3 transition-colors hover:bg-card/80"
          >
            <div>
              <p className="text-sm font-medium">
                <span
                  className={
                    o.side === "buy"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {o.side === "buy" ? "BUY" : "SELL"}
                </span>{" "}
                {o.ticker}
              </p>
              <p className="text-xs text-muted-foreground">
                {qty} {qty === 1 ? "share" : "shares"} · {priceLabel}
                {accountName ? ` · ${accountName}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{STATUS_LABEL[o.status]}</p>
              <p className="text-xs text-muted-foreground uppercase">
                {o.time_in_force}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
};
