import { getAccounts, getPortfolio } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";

export async function PositionsPanel() {
  const accounts = await getAccounts();

  const allPositions = await Promise.all(
    accounts.map(async (a) => {
      const positions = await getPortfolio(a.tradingAccount.id);
      return positions.map((p) => ({
        ...p,
        accountName: a.tradingAccount.name,
        accountType: a.tradingAccount.type,
      }));
    }),
  );

  const positions = allPositions.flat().filter((p) => p.quantity > 0);

  if (positions.length === 0) {
    return (
      <div className="pt-4">
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          No open positions. Place your first trade to get started.
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="grid min-w-[600px] grid-cols-[1fr_80px_100px_100px_100px_80px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Symbol</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Avg Cost</span>
          <span className="text-right">Price</span>
          <span className="text-right">Mkt Value</span>
          <span className="text-right">Account</span>
        </div>
        {positions.map((pos) => {
          const currentPrice = pos.symbol.quote?.price ?? 0;
          const mktValue = pos.quantity * Number(currentPrice);

          return (
            <div
              key={pos.id}
              className="grid min-w-[600px] grid-cols-[1fr_80px_100px_100px_100px_80px] gap-2 border-b border-border px-4 py-3 text-sm last:border-0"
            >
              <span className="font-medium">{pos.symbol.ticker}</span>
              <span className="text-right tabular-nums">
                {Number(pos.quantity).toLocaleString()}
              </span>
              <span className="text-right tabular-nums">
                ${Number(pos.averageCost).toFixed(2)}
              </span>
              <span className="text-right tabular-nums">
                ${Number(currentPrice).toFixed(2)}
              </span>
              <span className="text-right tabular-nums">
                ${mktValue.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="text-right">
                <Badge
                  variant={
                    pos.accountType === "investment" ? "default" : "outline"
                  }
                  size="sm"
                >
                  {pos.accountType === "investment" ? "Stocks" : "Crypto"}
                </Badge>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
