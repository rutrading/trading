import { getAccounts } from "@/app/actions/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export async function BalancesPanel() {
  const accounts = await getAccounts();

  const totalBalance = accounts.reduce(
    (sum, a) => sum + Number(a.tradingAccount.balance),
    0,
  );

  return (
    <div className="space-y-6 pt-4">
      <div className="rounded-xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Total Cash Across All Accounts
            </p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              $
              {totalBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <Badge variant="secondary">{accounts.length} accounts</Badge>
        </div>
      </div>

      <div className="space-y-3">
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
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash balance</span>
                  <span className="font-medium tabular-nums">
                    $
                    {Number(a.tradingAccount.balance).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
