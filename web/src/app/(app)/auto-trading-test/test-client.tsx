"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createStrategy,
  deleteStrategy,
  getStrategies,
  getStrategyRuns,
  patchStrategy,
  runStrategy,
  type Strategy,
  type StrategyRun,
} from "@/app/actions/strategies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toasts";

type Account = { id: number; name: string };

type Props = {
  accounts: Account[];
  initialAccountId: number | null;
  initialStrategies: Strategy[];
  initialRuns: StrategyRun[];
};

export function AutoTradingTestClient({
  accounts,
  initialAccountId,
  initialStrategies,
  initialRuns,
}: Props) {
  const [accountId, setAccountId] = useState<number | null>(initialAccountId);
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [runs, setRuns] = useState<StrategyRun[]>(initialRuns);
  const [ticker, setTicker] = useState("AAPL");
  const [name, setName] = useState("EMA 9/21");
  const [fastPeriod, setFastPeriod] = useState("9");
  const [slowPeriod, setSlowPeriod] = useState("21");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [maxPositionQuantity, setMaxPositionQuantity] = useState("100");
  const [maxDailyOrders, setMaxDailyOrders] = useState("5");
  const [cooldownMinutes, setCooldownMinutes] = useState("30");
  const [isPending, startTransition] = useTransition();

  const accountLabel = useMemo(() => {
    if (!accountId) return "No account";
    return accounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;
  }, [accountId, accounts]);

  const refreshData = (nextAccountId: number | null) => {
    if (!nextAccountId) return;
    startTransition(async () => {
      const [sRes, rRes] = await Promise.all([
        getStrategies(nextAccountId),
        getStrategyRuns(nextAccountId),
      ]);
      if (sRes.ok) setStrategies(sRes.data.strategies);
      if (rRes.ok) setRuns(rRes.data.runs);
    });
  };

  const handleCreate = () => {
    if (!accountId) {
      toast.error("No account", "Create an investment account first.");
      return;
    }

    startTransition(async () => {
      const res = await createStrategy({
        trading_account_id: accountId,
        name,
        ticker: ticker.trim().toUpperCase(),
        timeframe: "1Day",
        strategy_type: "ema_crossover",
        status: "active",
        params_json: {
          fast_period: Number(fastPeriod),
          slow_period: Number(slowPeriod),
          order_quantity: orderQuantity,
          max_position_quantity: maxPositionQuantity,
          max_daily_orders: Number(maxDailyOrders),
          cooldown_minutes: Number(cooldownMinutes),
        },
      });

      if (!res.ok) {
        toast.error("Create failed", res.error);
        return;
      }
      toast.success("Strategy created", `${res.data.ticker} is now automated.`);
      refreshData(accountId);
    });
  };

  const handleToggle = (strategy: Strategy) => {
    startTransition(async () => {
      const nextStatus = strategy.status === "active" ? "paused" : "active";
      const res = await patchStrategy(strategy.id, { status: nextStatus });
      if (!res.ok) {
        toast.error("Update failed", res.error);
        return;
      }
      refreshData(accountId);
    });
  };

  const handleDelete = (strategyId: number) => {
    startTransition(async () => {
      const res = await deleteStrategy(strategyId);
      if (!res.ok) {
        toast.error("Delete failed", res.error);
        return;
      }
      refreshData(accountId);
    });
  };

  const handleRunNow = (strategyId: number) => {
    startTransition(async () => {
      const res = await runStrategy(strategyId);
      if (!res.ok) {
        toast.error("Run failed", res.error);
        return;
      }
      refreshData(accountId);
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center gap-3">
          <Label htmlFor="acct">Account</Label>
          <select
            id="acct"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={accountId ?? ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              setAccountId(Number.isFinite(next) ? next : null);
              refreshData(Number.isFinite(next) ? next : null);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Selected: {accountLabel}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticker">Ticker</Label>
            <Input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fast">Fast EMA</Label>
            <Input id="fast" value={fastPeriod} onChange={(e) => setFastPeriod(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slow">Slow EMA</Label>
            <Input id="slow" value={slowPeriod} onChange={(e) => setSlowPeriod(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qty">Order Quantity</Label>
            <Input id="qty" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-pos">Max Position Qty</Label>
            <Input
              id="max-pos"
              value={maxPositionQuantity}
              onChange={(e) => setMaxPositionQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-day">Max Daily Orders</Label>
            <Input
              id="max-day"
              value={maxDailyOrders}
              onChange={(e) => setMaxDailyOrders(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cooldown">Cooldown (min)</Label>
            <Input
              id="cooldown"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={handleCreate} disabled={isPending || !accountId}>
            Create + Enable Strategy
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Strategies</h2>
        <div className="space-y-2">
          {strategies.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">
                  {s.name} - {s.ticker}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.strategy_type} | {s.status} | last run: {s.last_run_at ?? "never"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleRunNow(s.id)}>
                  Run Once
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleToggle(s)}>
                  {s.status === "active" ? "Pause" : "Activate"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(s.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {strategies.length === 0 && (
            <p className="text-sm text-muted-foreground">No strategies yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent Strategy Runs</h2>
        <div className="space-y-2">
          {runs.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                #{r.id} {r.ticker} - {r.signal} / {r.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {r.run_at} | {r.reason}
                {r.order_id ? ` | order ${r.order_id}` : ""}
                {r.error ? ` | error: ${r.error}` : ""}
              </p>
            </div>
          ))}
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
        </div>
      </div>
    </div>
  );
}
