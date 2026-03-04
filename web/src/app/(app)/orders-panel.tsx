import { getRecentOrders } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";

export async function OrdersPanel() {
  const orders = await getRecentOrders(50);

  if (orders.length === 0) {
    return (
      <div className="pt-4">
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          No orders yet. Place your first trade to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="grid min-w-[600px] grid-cols-[1fr_80px_80px_80px_100px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Symbol</span>
          <span>Side</span>
          <span>Type</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Total</span>
          <span className="text-right">Status</span>
        </div>
        {orders.map((order) => (
          <div
            key={order.id}
            className="grid min-w-[600px] grid-cols-[1fr_80px_80px_80px_100px_80px] gap-2 border-b border-border px-4 py-3 text-sm last:border-0"
          >
            <span className="font-medium">{order.symbol.ticker}</span>
            <span>
              <Badge
                variant={order.side === "buy" ? "success" : "destructive"}
                size="sm"
              >
                {order.side.toUpperCase()}
              </Badge>
            </span>
            <span className="capitalize text-muted-foreground">
              {order.type}
            </span>
            <span className="text-right tabular-nums">
              {Number(order.quantity).toLocaleString()}
            </span>
            <span className="text-right tabular-nums">
              $
              {Number(order.total).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-right">
              <Badge
                variant={
                  order.status === "filled"
                    ? "default"
                    : order.status === "pending"
                      ? "warning"
                      : "secondary"
                }
                size="sm"
              >
                {order.status}
              </Badge>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
