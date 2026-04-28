import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/app/actions/orders";
import type { HoldingRow } from "@/app/actions/portfolio";
import { fmtPrice } from "@/lib/format";

type AccountMeta = Record<number, { name: string }>;

const fmtQty = (value: string) => {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
};

const fmtUsd = (value: number) => `$${fmtPrice(value)}`;

export function PositionSummary({
  ticker,
  holdings,
  openOrders,
  accountsById,
  price,
}: {
  ticker: string;
  holdings: HoldingRow[];
  openOrders: Order[];
  accountsById: AccountMeta;
  price: number;
}) {
  const totalQty = holdings.reduce((sum, holding) => {
    const qty = parseFloat(holding.quantity);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  const reservedQty = holdings.reduce((sum, holding) => {
    const qty = parseFloat(holding.reserved_quantity);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  const totalValue = totalQty * price;

  return (
    <div className="rounded-2xl bg-accent p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        Position
      </h2>
      <div className="space-y-3 rounded-xl bg-card p-3 sm:p-4">
        <div className="rounded-lg bg-muted/24 px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">Shares held</span>
            <span className="text-base font-semibold tabular-nums">
              {fmtQty(String(totalQty))}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border/64 pt-2">
            <span className="text-xs text-muted-foreground">Market value</span>
            <span className="text-base font-semibold tabular-nums">
              {totalQty > 0 && price > 0 ? fmtUsd(totalValue) : "—"}
            </span>
          </div>
        </div>

        {reservedQty > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Reserved for sells</span>
            <span className="font-medium tabular-nums">{fmtQty(String(reservedQty))}</span>
          </div>
        )}

        <div className="space-y-2 rounded-lg bg-muted/24 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Open orders</p>
            <Badge variant={openOrders.length > 0 ? "warning" : "zinc"}>
              {openOrders.length}
            </Badge>
          </div>
          {openOrders.length > 0 ? (
            <div className="space-y-1.5">
              {openOrders.slice(0, 3).map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 border-t border-border/64 pt-2 text-xs first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={order.side === "buy" ? "success" : "destructive"}>
                        {order.side.toUpperCase()}
                      </Badge>
                      <span className="font-medium capitalize">
                        {order.order_type.replace("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-muted-foreground">
                      {accountsById[order.trading_account_id]?.name ?? `#${order.trading_account_id}`}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-medium">{fmtQty(order.quantity)}</p>
                    <p className="text-muted-foreground">{order.status.replace("_", " ")}</p>
                  </div>
                </div>
              ))}
              {openOrders.length > 3 && (
                <Link href="/orders" className="block text-xs text-primary hover:underline">
                  View all {openOrders.length} open orders
                </Link>
              )}
            </div>
          ) : (
            <div className="border-t border-border/64 pt-2 text-xs text-muted-foreground">
              No open {ticker} orders right now.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
