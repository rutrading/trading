import { getSession, getAccounts } from "@/app/actions/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "R U Trading" };

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  const accounts = await getAccounts();

  const totalBalance = accounts.reduce(
    (sum, a) => sum + Number(a.tradingAccount.balance),
    0,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {session.user.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s an overview of your trading accounts.
        </p>
      </div>

      <div className="rounded-xl border border-border p-6">
        <p className="text-sm text-muted-foreground">Total Cash Balance</p>
        <p className="text-3xl font-semibold tabular-nums tracking-tight">
          $
          {totalBalance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
      </div>

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
              <p className="text-xs text-muted-foreground">Cash balance</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
