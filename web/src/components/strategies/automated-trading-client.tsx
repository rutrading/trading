"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Pause, Play, ShieldWarning, TrendUp, Wrench } from "@phosphor-icons/react";
import {
  controlStrategies,
  createStrategy,
  deleteStrategy,
  getStrategyCatalog,
  getStrategies,
  getStrategyRuns,
  getStrategySnapshot,
  patchStrategy,
  runStrategy,
  runStrategyBacktest,
  type Strategy,
  type StrategyBacktestResult,
  type StrategyRun,
  type StrategySnapshot,
  type StrategyTemplate,
} from "@/app/actions/strategies";
import { getHoldings, getPortfolioTimeSeries, type PortfolioPoint } from "@/app/actions/portfolio";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardPanel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { PortfolioChart } from "@/components/dashboard/portfolio-chart";
import { StrategyBacktestChart } from "@/components/strategies/strategy-backtest-chart";
import { useStrategyStream } from "@/hooks/use-strategy-stream";
import { toast } from "@/lib/toasts";

type Account = { id: number; name: string };

type Props = {
  accounts: Account[];
  initialAccountId: number | null;
  initialStrategies: Strategy[];
  initialRuns: StrategyRun[];
  initialSnapshot: StrategySnapshot | null;
  initialCatalog: StrategyTemplate[];
  initialPortfolio: {
    data: PortfolioPoint[];
    totalCash: number;
    tickerQuantities: Record<string, string>;
    liveValue: number | null;
  };
  defaultSection?: "overview" | "monitor" | "backtest";
};

const defaultParams = {
  fast_period: "9",
  slow_period: "21",
  order_quantity: "1",
};

const defaultRisk = {
  max_position_quantity: "100",
  max_daily_orders: "5",
  cooldown_minutes: "30",
  max_daily_notional: "10000",
};

function templateValue(value: unknown, fallback: string) {
  return value == null ? fallback : String(value);
}

function splitSymbols(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function fmtNum(value: string | number | null | undefined) {
  if (value == null) return "-";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value);
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function AutomatedTradingClient({
  accounts,
  initialAccountId,
  initialStrategies,
  initialRuns,
  initialSnapshot,
  initialCatalog,
  initialPortfolio,
  defaultSection = "overview",
}: Props) {
  const initialTemplate = initialCatalog[0];
  const [accountId, setAccountId] = useState<number | null>(initialAccountId);
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [runs, setRuns] = useState<StrategyRun[]>(initialRuns);
  const [snapshot, setSnapshot] = useState<StrategySnapshot | null>(initialSnapshot);
  const [catalog, setCatalog] = useState<StrategyTemplate[]>(initialCatalog);
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [section, setSection] = useState(defaultSection);
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate?.id ?? "ema_crossover");
  const [name, setName] = useState("EMA Basket");
  const [symbolsText, setSymbolsText] = useState("AAPL");
  const [fastPeriod, setFastPeriod] = useState(
    templateValue(initialTemplate?.default_params_json.fast_period, defaultParams.fast_period),
  );
  const [slowPeriod, setSlowPeriod] = useState(
    templateValue(initialTemplate?.default_params_json.slow_period, defaultParams.slow_period),
  );
  const [orderQuantity, setOrderQuantity] = useState(
    templateValue(initialTemplate?.default_params_json.order_quantity, defaultParams.order_quantity),
  );
  const [capitalAllocation, setCapitalAllocation] = useState("10000");
  const [maxPositionQuantity, setMaxPositionQuantity] = useState(
    templateValue(initialTemplate?.default_risk_json.max_position_quantity, defaultRisk.max_position_quantity),
  );
  const [maxDailyOrders, setMaxDailyOrders] = useState(
    templateValue(initialTemplate?.default_risk_json.max_daily_orders, defaultRisk.max_daily_orders),
  );
  const [cooldownMinutes, setCooldownMinutes] = useState(
    templateValue(initialTemplate?.default_risk_json.cooldown_minutes, defaultRisk.cooldown_minutes),
  );
  const [maxDailyNotional, setMaxDailyNotional] = useState(
    templateValue(initialTemplate?.default_risk_json.max_daily_notional, defaultRisk.max_daily_notional),
  );
  const [allowPyramiding, setAllowPyramiding] = useState(false);
  const [backtestStart, setBacktestStart] = useState(() => {
    return new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  });
  const [backtestEnd, setBacktestEnd] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [backtestResult, setBacktestResult] = useState<StrategyBacktestResult | null>(null);
  const [pending, startTransition] = useTransition();

  const accountLabel = useMemo(() => {
    if (!accountId) return "No account";
    return accounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;
  }, [accountId, accounts]);

  const template = useMemo(
    () => catalog.find((item) => item.id === selectedTemplate) ?? catalog[0],
    [catalog, selectedTemplate],
  );

  function applyTemplate(nextTemplate: StrategyTemplate) {
    setSelectedTemplate(nextTemplate.id);
    setFastPeriod(
      templateValue(nextTemplate.default_params_json.fast_period, defaultParams.fast_period),
    );
    setSlowPeriod(
      templateValue(nextTemplate.default_params_json.slow_period, defaultParams.slow_period),
    );
    setOrderQuantity(
      templateValue(nextTemplate.default_params_json.order_quantity, defaultParams.order_quantity),
    );
    setMaxPositionQuantity(
      templateValue(
        nextTemplate.default_risk_json.max_position_quantity,
        defaultRisk.max_position_quantity,
      ),
    );
    setMaxDailyOrders(
      templateValue(nextTemplate.default_risk_json.max_daily_orders, defaultRisk.max_daily_orders),
    );
    setCooldownMinutes(
      templateValue(nextTemplate.default_risk_json.cooldown_minutes, defaultRisk.cooldown_minutes),
    );
    setMaxDailyNotional(
      templateValue(
        nextTemplate.default_risk_json.max_daily_notional,
        defaultRisk.max_daily_notional,
      ),
    );
  }

  const streamStatus = useStrategyStream(accountId, (nextSnapshot) => {
    setSnapshot(nextSnapshot);
    setStrategies(nextSnapshot.strategies);
    setRuns(nextSnapshot.runs);
  });

  useEffect(() => {
    if (catalog.length > 0) return;
    startTransition(async () => {
      const res = await getStrategyCatalog();
      if (!res.ok) return;
      setCatalog(res.data.templates);
      if (res.data.templates[0]) applyTemplate(res.data.templates[0]);
    });
  }, [catalog.length]);

  async function refreshAccount(nextAccountId: number | null) {
    if (!nextAccountId) return;
    const [snapshotRes, holdingsRes, runsRes, strategiesRes] = await Promise.all([
      getStrategySnapshot(nextAccountId),
      getHoldings(nextAccountId),
      getStrategyRuns(nextAccountId),
      getStrategies(nextAccountId),
    ]);

    if (snapshotRes.ok) setSnapshot(snapshotRes.data);
    if (strategiesRes.ok) setStrategies(strategiesRes.data.strategies);
    if (runsRes.ok) setRuns(runsRes.data.runs);
    if (holdingsRes.ok) {
      const quantities: Record<string, string> = {};
      for (const holding of holdingsRes.data.holdings) {
        const available = Math.max(0, Number(holding.quantity) - Number(holding.reserved_quantity));
        quantities[holding.ticker] = String(available);
      }
      const totalCash = Number(holdingsRes.data.cash_balance);
      const portfolioHoldings = holdingsRes.data.holdings.map((holding) => ({
        ...holding,
        trading_account_id: nextAccountId,
      }));
      const points = await getPortfolioTimeSeries(portfolioHoldings, totalCash, 30);
      setPortfolio({
        data: points,
        tickerQuantities: quantities,
        totalCash,
        liveValue: null,
      });
    }
  }

  useEffect(() => {
    if (!accountId) return;
    startTransition(() => {
      void refreshAccount(accountId);
    });
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    const timer = window.setInterval(() => {
      startTransition(() => {
        void refreshAccount(accountId);
      });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [accountId]);

  function handleCreate() {
    if (!accountId) return;
    const symbols = splitSymbols(symbolsText);
    if (symbols.length === 0) {
      toast.error("Missing symbols", "Enter at least one ticker.");
      return;
    }

    startTransition(async () => {
      const res = await createStrategy({
        trading_account_id: accountId,
        name,
        ticker: symbols[0],
        symbols_json: symbols,
        timeframe: "1Day",
        strategy_type: "ema_crossover",
        status: "active",
        capital_allocation: capitalAllocation,
        params_json: {
          fast_period: Number(fastPeriod),
          slow_period: Number(slowPeriod),
          order_quantity: orderQuantity,
        },
        risk_json: {
          max_position_quantity: maxPositionQuantity,
          max_daily_orders: Number(maxDailyOrders),
          cooldown_minutes: Number(cooldownMinutes),
          max_daily_notional: maxDailyNotional,
          allow_pyramiding: allowPyramiding,
        },
      });

      if (!res.ok) {
        toast.error("Create failed", res.error);
        return;
      }
      toast.success("Strategy created", `${res.data.name} is active.`);
      await refreshAccount(accountId);
    });
  }

  function handleToggle(strategy: Strategy) {
    startTransition(async () => {
      const nextStatus = strategy.status === "active" ? "paused" : "active";
      const res = await patchStrategy(strategy.id, { status: nextStatus });
      if (!res.ok) {
        toast.error("Update failed", res.error);
        return;
      }
      await refreshAccount(accountId);
    });
  }

  function handleDelete(strategyId: number) {
    startTransition(async () => {
      const res = await deleteStrategy(strategyId);
      if (!res.ok) {
        toast.error("Delete failed", res.error);
        return;
      }
      await refreshAccount(accountId);
    });
  }

  function handleRunNow(strategyId: number) {
    startTransition(async () => {
      const res = await runStrategy(strategyId);
      if (!res.ok) {
        toast.error("Run failed", res.error);
        return;
      }
      await refreshAccount(accountId);
    });
  }

  function handleControl(action: "pause_all" | "resume_all" | "disable_all") {
    if (!accountId) return;
    startTransition(async () => {
      const res = await controlStrategies({ trading_account_id: accountId, action });
      if (!res.ok) {
        toast.error("Control failed", res.error);
        return;
      }
      toast.success("Strategies updated", `${res.data.updated} strategies changed to ${res.data.status}.`);
      await refreshAccount(accountId);
    });
  }

  function handleBacktest() {
    if (!accountId) return;
    const symbols = splitSymbols(symbolsText);
    if (symbols.length === 0) {
      toast.error("Missing symbols", "Enter at least one ticker.");
      return;
    }

    startTransition(async () => {
      const res = await runStrategyBacktest({
        strategy_type: "ema_crossover",
        ticker: symbols[0],
        symbols_json: symbols,
        timeframe: "1Day",
        capital_allocation: capitalAllocation,
        params_json: {
          fast_period: Number(fastPeriod),
          slow_period: Number(slowPeriod),
          order_quantity: orderQuantity,
        },
        risk_json: {
          max_position_quantity: maxPositionQuantity,
          max_daily_orders: Number(maxDailyOrders),
          cooldown_minutes: Number(cooldownMinutes),
          max_daily_notional: maxDailyNotional,
          allow_pyramiding: allowPyramiding,
        },
        start: backtestStart,
        end: backtestEnd,
      });

      if (!res.ok) {
        toast.error("Backtest failed", res.error);
        return;
      }
      setBacktestResult(res.data);
      setSection("backtest");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automated Trading</h1>
          <p className="text-sm text-muted-foreground">
            Strategy catalog, live monitoring, risk controls, and backtesting in one place.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
          <Label htmlFor="account" className="text-xs uppercase text-muted-foreground">Account</Label>
          <select
            id="account"
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={accountId ?? ""}
            onChange={(e) => {
              const next = Number(e.target.value);
              setAccountId(Number.isFinite(next) ? next : null);
            }}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{accountLabel}</span>
        </div>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as typeof section)}>
        <TabsList>
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="monitor">Live Monitor</TabsTab>
          <TabsTab value="backtest">Backtest</TabsTab>
        </TabsList>

        <TabsPanel value="overview" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Strategy Catalog</CardTitle>
              <CardDescription>Choose a template and inspect the supported runtime controls.</CardDescription>
            </CardHeader>
            <CardPanel className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {catalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyTemplate(item)}
                  className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Badge variant={item.id === selectedTemplate ? "default" : "outline"}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Timeframes: {item.supported_timeframes.join(", ")}
                  </p>
                </button>
              ))}
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Strategy Instance</CardTitle>
              <CardDescription>Define symbols, capital allocation, and risk controls before enabling automation.</CardDescription>
            </CardHeader>
            <CardPanel className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="strategy-name">Name</Label>
                  <Input id="strategy-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="symbols">Symbol(s)</Label>
                  <Input id="symbols" value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="capital">Capital Allocation</Label>
                  <Input id="capital" value={capitalAllocation} onChange={(e) => setCapitalAllocation(e.target.value)} />
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
                  <Label htmlFor="qty">Order Qty</Label>
                  <Input id="qty" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="max-pos">Max Position Qty</Label>
                  <Input id="max-pos" value={maxPositionQuantity} onChange={(e) => setMaxPositionQuantity(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="max-orders">Max Daily Orders</Label>
                  <Input id="max-orders" value={maxDailyOrders} onChange={(e) => setMaxDailyOrders(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cooldown">Cooldown (min)</Label>
                  <Input id="cooldown" value={cooldownMinutes} onChange={(e) => setCooldownMinutes(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="max-notional">Max Daily Notional</Label>
                  <Input id="max-notional" value={maxDailyNotional} onChange={(e) => setMaxDailyNotional(e.target.value)} />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                <Switch checked={allowPyramiding} onCheckedChange={setAllowPyramiding} />
                <div>
                  <p className="text-sm font-medium">Allow pyramiding</p>
                  <p className="text-xs text-muted-foreground">Let the strategy add to an existing position when risk allows.</p>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={pending || !accountId}>
                Create Strategy
              </Button>
            </CardPanel>
          </Card>
        </TabsPanel>

        <TabsPanel value="monitor" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>Per-strategy and per-account guardrails. Global executor state is read from the backend.</CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => void handleControl("pause_all")}>Pause All</Button>
              <Button variant="outline" onClick={() => void handleControl("resume_all")}>Resume All</Button>
              <Button variant="destructive" onClick={() => void handleControl("disable_all")}>
                <ShieldWarning className="mr-2 size-4" /> Emergency Stop
              </Button>
              <Badge variant={snapshot?.strategy_executor_enabled ? "success" : "error"}>
                Executor {snapshot?.strategy_executor_enabled ? "enabled" : "disabled"}
              </Badge>
              <Badge variant={streamStatus === "live" ? "success" : streamStatus === "connecting" ? "warning" : "outline"}>
                Stream {streamStatus}
              </Badge>
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current State</CardTitle>
              <CardDescription>Active strategies, latest signals, open positions, and open orders.</CardDescription>
            </CardHeader>
            <CardPanel className="grid gap-4 xl:grid-cols-3">
              <Metric label="Strategies" value={strategies.length} />
              <Metric label="Open Orders" value={snapshot?.open_orders.length ?? 0} />
              <Metric label="Open Positions" value={snapshot?.open_positions.length ?? 0} />
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PnL Chart</CardTitle>
              <CardDescription>Portfolio value for the selected strategy account.</CardDescription>
            </CardHeader>
            <CardPanel>
              <PortfolioChart
                key={accountId ?? 0}
                data={portfolio.data}
                tickerQuantities={portfolio.tickerQuantities}
                totalCash={portfolio.totalCash}
                liveValue={portfolio.liveValue}
              />
            </CardPanel>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Latest Signals</CardTitle>
              </CardHeader>
              <CardPanel className="space-y-2">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.id} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{run.ticker} · {run.signal}</div>
                      <Badge variant={run.action === "none" ? "outline" : "default"}>{run.action}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{run.run_at} · {run.reason}</p>
                  </div>
                ))}
                {runs.length === 0 && <p className="text-sm text-muted-foreground">No strategy runs yet.</p>}
              </CardPanel>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Open Orders</CardTitle>
              </CardHeader>
              <CardPanel className="space-y-2">
                {(snapshot?.open_orders ?? []).map((order) => (
                  <div key={String(order.id)} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{String(order.ticker)} · {String(order.side)}</div>
                      <Badge variant="outline">{String(order.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {String(order.order_type)} · {String(order.time_in_force)} · qty {String(order.quantity)}
                    </p>
                  </div>
                ))}
                {(snapshot?.open_orders ?? []).length === 0 && <p className="text-sm text-muted-foreground">No open orders.</p>}
              </CardPanel>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
            </CardHeader>
            <CardPanel className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(snapshot?.open_positions ?? []).map((position) => (
                <div key={String(position.id)} className="rounded-xl border bg-card p-3 text-sm">
                  <p className="font-medium">{String(position.ticker)}</p>
                  <p className="text-xs text-muted-foreground">
                    qty {String(position.quantity)} · reserved {String(position.reserved_quantity)} · avg {String(position.average_cost)}
                  </p>
                </div>
              ))}
              {(snapshot?.open_positions ?? []).length === 0 && <p className="text-sm text-muted-foreground">No open positions.</p>}
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Strategies</CardTitle>
            </CardHeader>
            <CardPanel className="space-y-2">
              {strategies.map((strategy) => (
                <div key={strategy.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm">
                  <div>
                    <p className="font-medium">{strategy.name} · {strategy.ticker}</p>
                    <p className="text-xs text-muted-foreground">
                      {strategy.symbols_json.join(", ")} · {strategy.status} · capital {strategy.capital_allocation}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleRunNow(strategy.id)}>
                      <Play className="mr-2 size-4" /> Run Once
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void handleToggle(strategy)}>
                      {strategy.status === "active" ? (
                        <>
                          <Pause className="mr-2 size-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 size-4" /> Activate
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void handleDelete(strategy.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {strategies.length === 0 && <p className="text-sm text-muted-foreground">No strategies yet.</p>}
            </CardPanel>
          </Card>
        </TabsPanel>

        <TabsPanel value="backtest" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Backtest</CardTitle>
              <CardDescription>Run the same strategy logic against historical bars before enabling paper trading.</CardDescription>
            </CardHeader>
            <CardPanel className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="bt-start">Start</Label>
                  <Input id="bt-start" type="date" value={backtestStart} onChange={(e) => setBacktestStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bt-end">End</Label>
                  <Input id="bt-end" type="date" value={backtestEnd} onChange={(e) => setBacktestEnd(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Template</Label>
                  <Input value={template?.name ?? "EMA Crossover"} readOnly />
                </div>
                <div className="space-y-1">
                  <Label>Symbols</Label>
                  <Input value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => void handleBacktest()} disabled={pending || !accountId}>
                  <TrendUp className="mr-2 size-4" /> Run Backtest
                </Button>
                <Button variant="outline" onClick={() => setSection("overview")}>
                  <Wrench className="mr-2 size-4" /> Edit Setup
                </Button>
              </div>
            </CardPanel>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>Equity curve, drawdown, trade list, win rate, and average return per trade.</CardDescription>
            </CardHeader>
            <CardPanel className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Metric label="Win rate" value={backtestResult ? `${(backtestResult.win_rate * 100).toFixed(1)}%` : "-"} />
                <Metric label="Avg return/trade" value={backtestResult ? `${(backtestResult.avg_return_per_trade * 100).toFixed(2)}%` : "-"} />
                <Metric label="Max drawdown" value={backtestResult ? `${(backtestResult.max_drawdown * 100).toFixed(2)}%` : "-"} />
                <Metric label="Ending equity" value={backtestResult ? fmtNum(backtestResult.ending_equity) : "-"} />
                <Metric label="Trades" value={backtestResult?.trades.length ?? 0} />
              </div>

              <StrategyBacktestChart
                equity={backtestResult?.equity_curve ?? []}
                drawdown={backtestResult?.drawdown_curve ?? []}
              />

              <div className="space-y-2">
                {(backtestResult?.trades ?? []).map((trade, index) => (
                  <div key={`${trade.ticker}-${index}`} className="rounded-xl border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{trade.ticker} · {trade.side}</p>
                      <Badge variant={trade.side === "buy" ? "success" : "outline"}>{trade.quantity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {trade.timestamp} · ${trade.price} {trade.profit ? `· PnL ${trade.profit}` : ""}
                    </p>
                  </div>
                ))}
                {(backtestResult?.trades ?? []).length === 0 && <p className="text-sm text-muted-foreground">Run a backtest to see trades.</p>}
              </div>
            </CardPanel>
          </Card>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
