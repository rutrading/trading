import { getAccounts } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";

export async function AccountsSection() {
  const memberships = await getAccounts();

  return (
    <div className="space-y-4 rounded-xl border border-border p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Trading Accounts
        </h2>
        <p className="text-sm text-muted-foreground">
          Your personal and joint trading accounts.
        </p>
      </div>
      <div className="space-y-3">
        {memberships.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
          >
            <p className="text-sm font-medium">{m.tradingAccount.name}</p>
            <div className="flex items-center gap-2">
              {m.tradingAccount.isJoint && (
                <Badge variant="secondary" size="sm">
                  Joint
                </Badge>
              )}
              <Badge
                variant={
                  m.tradingAccount.type === "investment"
                    ? "default"
                    : "outline"
                }
                size="sm"
              >
                {m.tradingAccount.type === "investment" ? "Stocks" : "Crypto"}
              </Badge>
              <span className="text-sm font-medium tabular-nums">
                $
                {Number(m.tradingAccount.balance).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
