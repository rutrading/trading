"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createStrategy,
  deleteStrategy,
  getStrategies,
  getStrategyCatalog,
  getStrategyRuns,
  patchStrategy,
  runStrategy,
  type Strategy,
  type StrategyRun,
  type StrategyTemplate,
} from "@/app/actions/strategies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildTemplatePayload,
  StrategyFieldGrid,
  type StrategyFieldValues,
  valuesForFields,
} from "@/components/strategies/strategy-template-fields";
import { toast } from "@/lib/toasts";

type Account = { id: number; name: string };

type Props = {
  accounts: Account[];
  initialAccountId: number | null;
  initialCatalog: StrategyTemplate[];
  initialStrategies: Strategy[];
  initialRuns: StrategyRun[];
};

export function AutoTradingTestClient({
  accounts,
  initialAccountId,
  initialCatalog,
  initialStrategies,
  initialRuns,
}: Props) {
  const initialTemplate = initialCatalog[0];
  const [accountId, setAccountId] = useState<number | null>(initialAccountId);
  const [catalog, setCatalog] = useState<StrategyTemplate[]>(initialCatalog);
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [runs, setRuns] = useState<StrategyRun[]>(initialRuns);
  const [ticker, setTicker] = useState("AAPL");
  const [name, setName] = useState("EMA 9/21");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate?.id ?? "ema_crossover");
  const [capitalAllocation, setCapitalAllocation] = useState("10000");
  const [paramValues, setParamValues] = useState<StrategyFieldValues>(() =>
    initialTemplate
      ? valuesForFields(
          initialTemplate.params_schema_json,
          initialTemplate.default_params_json,
        )
      : {},
  );
  const [riskValues, setRiskValues] = useState<StrategyFieldValues>(() =>
    initialTemplate
      ? valuesForFields(
          initialTemplate.risk_schema_json,
          initialTemplate.default_risk_json,
        )
      : {},
  );
  const [isPending, startTransition] = useTransition();

  const template = useMemo(
    () => catalog.find((item) => item.id === selectedTemplate) ?? catalog[0],
    [catalog, selectedTemplate],
  );

  const accountLabel = useMemo(() => {
    if (!accountId) return "No account";
    return accounts.find((a) => a.id === accountId)?.name ?? `Account ${accountId}`;
  }, [accountId, accounts]);

  function applyTemplate(nextTemplate: StrategyTemplate) {
    setSelectedTemplate(nextTemplate.id);
    setParamValues((current) =>
      valuesForFields(
        nextTemplate.params_schema_json,
        nextTemplate.default_params_json,
        current,
      ),
    );
    setRiskValues((current) =>
      valuesForFields(
        nextTemplate.risk_schema_json,
        nextTemplate.default_risk_json,
        current,
      ),
    );
  }

  useEffect(() => {
    if (catalog.length > 0) return;
    startTransition(async () => {
      const res = await getStrategyCatalog();
      if (!res.ok) return;
      setCatalog(res.data.templates);
      if (res.data.templates[0]) applyTemplate(res.data.templates[0]);
    });
  }, [catalog.length]);

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
    if (!accountId || !template) {
      toast.error("No account", "Create an investment account first.");
      return;
    }

    const payload = buildTemplatePayload(template, paramValues, riskValues);

    startTransition(async () => {
      const res = await createStrategy({
        trading_account_id: accountId,
        name,
        ticker: ticker.trim().toUpperCase(),
        timeframe: "1Day",
        strategy_type: template.id,
        status: "active",
        capital_allocation: capitalAllocation,
        params_json: payload.params_json,
        risk_json: payload.risk_json,
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ticker">Ticker</Label>
            <Input id="ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="capital-allocation">Capital Allocation</Label>
            <Input
              id="capital-allocation"
              value={capitalAllocation}
              onChange={(e) => setCapitalAllocation(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="template">Template</Label>
            <select
              id="template"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={template?.id ?? ""}
              onChange={(e) => {
                const next = catalog.find((item) => item.id === e.target.value);
                if (next) applyTemplate(next);
              }}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-semibold">Strategy Parameters</p>
            <p className="text-xs text-muted-foreground">Only inputs for the selected strategy are rendered.</p>
          </div>
          <StrategyFieldGrid
            fields={template?.params_schema_json ?? []}
            values={paramValues}
            onChange={(key, value) => setParamValues((current) => ({ ...current, [key]: value }))}
            idPrefix="test-param"
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          />

          <div>
            <p className="text-sm font-semibold">Risk Controls</p>
            <p className="text-xs text-muted-foreground">ATR sizing and shared risk guardrails stay consistent with the main page.</p>
          </div>
          <StrategyFieldGrid
            fields={template?.risk_schema_json ?? []}
            values={riskValues}
            onChange={(key, value) => setRiskValues((current) => ({ ...current, [key]: value }))}
            idPrefix="test-risk"
            className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
          />
        </div>

        <div className="mt-4">
          <Button onClick={handleCreate} disabled={isPending || !accountId || !template}>
            Create + Enable Strategy
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Strategies</h2>
        <div className="space-y-2">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="font-medium">
                  {strategy.name} - {strategy.ticker}
                </p>
                <p className="text-xs text-muted-foreground">
                  {strategy.strategy_type} | {strategy.status} | last run: {strategy.last_run_at ?? "never"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleRunNow(strategy.id)}>
                  Run Once
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleToggle(strategy)}>
                  {strategy.status === "active" ? "Pause" : "Activate"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(strategy.id)}>
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
          {runs.map((run) => (
            <div key={run.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                #{run.id} {run.ticker} - {run.signal} / {run.action}
              </p>
              <p className="text-xs text-muted-foreground">
                {run.run_at} | {run.reason}
                {run.order_id ? ` | order ${run.order_id}` : ""}
                {run.error ? ` | error: ${run.error}` : ""}
              </p>
            </div>
          ))}
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
        </div>
      </div>
    </div>
  );
}
