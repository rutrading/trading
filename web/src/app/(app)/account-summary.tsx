import { getAccounts, getRecentOrders } from "@/app/actions/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function AccountSummary() {
  const [accounts, recentOrders] = await Promise.all([
    getAccounts(),
    getRecentOrders(5),
  ]);

  const totalBalance = accounts.reduce(
    (sum, a) => sum + Number(a.tradingAccount.balance),
    0,
  );

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <CardHeader>
          <CardDescription>Total Cash Balance</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            $
            {totalBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {a.tradingAccount.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {a.tradingAccount.isJoint && (
                    <Badge variant="secondary" size="sm">
                      Joint
                    </Badge>
                  )}
                  <Badge
                    variant={
                      a.tradingAccount.type === "investment"
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                  >
                    {a.tradingAccount.type === "investment"
                      ? "Stocks"
                      : "Crypto"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">
                $
                {Number(a.tradingAccount.balance).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cash balance
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {recentOrders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Recent Activity
          </h3>
          <div className="rounded-xl border border-border">
            {recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between border-b border-border px-4 py-3 text-sm last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      order.side === "buy" ? "success" : "destructive"
                    }
                    size="sm"
                  >
                    {order.side.toUpperCase()}
                  </Badge>
                  <span className="font-medium">{order.symbol.ticker}</span>
                  <span className="text-muted-foreground">
                    {Number(order.quantity).toLocaleString()} shares
                  </span>
                </div>
                <span className="font-medium tabular-nums">
                  $
                  {Number(order.total).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
