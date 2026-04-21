"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toastManager } from "@/components/ui/toast";
import { SymbolSearch, type SymbolItem } from "@/components/symbol-search";
import { useQuote } from "@/components/ws-provider";
import { placeOrder } from "@/app/actions/orders";
import type { QuoteSnapshot } from "@/app/actions/quotes";
import { cn } from "@/lib/utils";
import { fmtPrice } from "@/lib/format";

export type TradeAccount = {
  id: number;
  name: string;
  type: "investment" | "crypto";
  isJoint: boolean;
  balance: string;
  reservedBalance: string;
};

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop" | "stop_limit";
type TimeInForce = "day" | "gtc" | "opg" | "cls";

const fmtUsd = (n: number) => `$${fmtPrice(n)}`;

export function TradeForm({
  accounts,
  initialAccountId,
  initialTicker,
  marketOpen,
  holdingsByAccount,
}: {
  accounts: TradeAccount[];
  initialAccountId?: number;
  initialTicker?: string;
  marketOpen: boolean;
  holdingsByAccount: Record<number, Record<string, string>>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Account selection is the single source of truth for asset class.
  const initialAccount = accounts.find((a) => a.id === initialAccountId);
  const [accountId, setAccountId] = useState<number | undefined>(
    initialAccount?.id,
  );

  const [ticker, setTicker] = useState<string | undefined>(initialTicker);
  const [tickerName, setTickerName] = useState<string | undefined>(undefined);

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("gtc");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<"shares" | "dollars">("shares");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const isCrypto = account?.type === "crypto";
  const assetClass: "us_equity" | "crypto" = isCrypto ? "crypto" : "us_equity";
  const offHoursStockGuard = account?.type === "investment" && !marketOpen;

  // Off-hours + stock account, market + GTC is an invalid combo. Reconcile on
  // mount or whenever the guard flips so the dropdowns don't show values that
  // aren't in their own option lists.
  useEffect(() => {
    if (!offHoursStockGuard) return;
    if (orderType === "market" && timeInForce === "gtc") {
      setTimeInForce("opg");
    }
  }, [offHoursStockGuard, orderType, timeInForce]);

  const liveQuote = useQuote(ticker ?? null);
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // REST snapshot on ticker change; WS ticks take over once they arrive.
  useEffect(() => {
    setSnapshot(null);
    if (!ticker) {
      setQuoteLoading(false);
      return;
    }
    setQuoteLoading(true);
    const controller = new AbortController();
    fetch(`/api/quote?ticker=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((body) => {
        if (controller.signal.aborted) return;
        setSnapshot(body?.ok ? (body.data as QuoteSnapshot) : null);
        setQuoteLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setSnapshot(null);
        setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [ticker]);

  // Only fall back to the snapshot if the live quote is for THIS ticker
  // (useQuote may briefly return the prior ticker's data during a switch).
  const snapshotQuote = snapshot
    ? {
        price: snapshot.price ?? 0,
        change: snapshot.change ?? 0,
        change_percent: snapshot.change_percent ?? 0,
        bid_price: snapshot.bid_price ?? 0,
        ask_price: snapshot.ask_price ?? 0,
      }
    : null;
  const quote = liveQuote ?? snapshotQuote;

  const available =
    account &&
    Math.max(
      0,
      parseFloat(account.balance) - parseFloat(account.reservedBalance),
    );

  const referencePrice =
    orderType === "limit" || orderType === "stop_limit"
      ? parseFloat(limitPrice)
      : orderType === "stop"
        ? parseFloat(stopPrice)
        : (quote?.price ?? NaN);
  const qtyNum = parseFloat(quantity);
  // When the user enters a dollar amount, we convert to shares at submit time
  // using the reference price. Everything downstream (estimated total, sell
  // helper, payload) works in shares.
  const sharesFromInput =
    quantityUnit === "dollars" && Number.isFinite(referencePrice) && referencePrice > 0
      ? qtyNum / referencePrice
      : qtyNum;
  const estimatedTotal =
    Number.isFinite(sharesFromInput) && Number.isFinite(referencePrice)
      ? sharesFromInput * referencePrice
      : NaN;

  // Off-hours on a stock account, a market order can't be GTC (it'd fill at
  // the stale last-close price before the next session). So we couple the two
  // selects: picking Market restricts TIF to OPG/CLS, and picking GTC hides
  // Market from the order-type list.
  const marketAllowed = !offHoursStockGuard || timeInForce !== "gtc";
  const availableOrderTypes: { value: OrderType; label: string }[] = [
    ...(marketAllowed ? [{ value: "market" as const, label: "Market" }] : []),
    { value: "limit", label: "Limit" },
    { value: "stop", label: "Stop" },
    { value: "stop_limit", label: "Stop Limit" },
  ];

  const availableTifs: { value: TimeInForce; label: string }[] = (() => {
    if (!offHoursStockGuard) {
      return [
        { value: "day", label: "Day" },
        { value: "gtc", label: "Good-til-Canceled" },
        { value: "opg", label: "On the Open" },
        { value: "cls", label: "On the Close" },
      ];
    }
    // off-hours: no Day; GTC only when order type is not Market
    const tifs: { value: TimeInForce; label: string }[] = [];
    if (orderType !== "market") {
      tifs.push({ value: "gtc", label: "Good-til-Canceled" });
    }
    tifs.push({ value: "opg", label: "On the Open" });
    tifs.push({ value: "cls", label: "On the Close" });
    return tifs;
  })();

  function syncUrl(next: {
    account?: number | null;
    ticker?: string | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.account === null) params.delete("account");
    else if (next.account !== undefined) params.set("account", String(next.account));
    if (next.ticker === null) params.delete("ticker");
    else if (next.ticker !== undefined) params.set("ticker", next.ticker);
    router.replace(`/trade?${params.toString()}`);
  }

  function handleAccountChange(nextId: number) {
    const next = accounts.find((a) => a.id === nextId);
    if (!next) return;
    const classChanged = account && next.type !== account.type;
    setAccountId(next.id);
    if (classChanged) {
      setTicker(undefined);
      setTickerName(undefined);
      setTimeInForce("gtc");
      syncUrl({ account: next.id, ticker: null });
    } else {
      if (!account) setTimeInForce("gtc");
      syncUrl({ account: next.id });
    }
  }

  function handleSymbolSelect(item: SymbolItem) {
    if (!account) {
      toastManager.add({
        title: "Select an account first",
        description: "Choose which account to trade in before picking a symbol.",
        type: "error",
      });
      return;
    }
    const wantedClass = account.type === "crypto" ? "crypto" : "us_equity";
    if (item.assetClass !== wantedClass) {
      toastManager.add({
        title: "Wrong asset class",
        description:
          wantedClass === "crypto"
            ? "This is a crypto account. Pick a crypto pair."
            : "This is a stock account. Pick a stock or ETF.",
        type: "error",
      });
      return;
    }
    setTicker(item.ticker);
    setTickerName(item.name);
    syncUrl({ ticker: item.ticker });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!accountId) {
      setError("Select a trading account.");
      return;
    }
    if (!ticker) {
      setError("Pick a symbol to trade.");
      return;
    }
    if (!quantity || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Enter a positive quantity.");
      return;
    }
    if (quantityUnit === "dollars") {
      if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
        setError(
          "Can't convert dollars to shares without a price. Switch to Shares or enter a limit/stop.",
        );
        return;
      }
    }
    if (
      (orderType === "limit" || orderType === "stop_limit") &&
      (!limitPrice || parseFloat(limitPrice) <= 0)
    ) {
      setError("Enter a limit price.");
      return;
    }
    if (
      (orderType === "stop" || orderType === "stop_limit") &&
      (!stopPrice || parseFloat(stopPrice) <= 0)
    ) {
      setError("Enter a stop price.");
      return;
    }

    // Backend takes shares only; convert when the user picked Dollars.
    const sharesToSubmit =
      quantityUnit === "dollars"
        // cap at 8 decimals which matches the numeric(16,8) quantity column
        ? (qtyNum / referencePrice).toFixed(8).replace(/\.?0+$/, "")
        : quantity;

    startTransition(async () => {
      const res = await placeOrder({
        tradingAccountId: accountId,
        ticker,
        assetClass,
        side,
        orderType,
        timeInForce: isCrypto ? undefined : timeInForce,
        quantity: sharesToSubmit,
        limitPrice:
          orderType === "limit" || orderType === "stop_limit"
            ? limitPrice
            : undefined,
        stopPrice:
          orderType === "stop" || orderType === "stop_limit"
            ? stopPrice
            : undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      const filled = res.data.status === "filled";
      toastManager.add({
        title: filled ? "Order filled" : "Order placed",
        description: `${side.toUpperCase()} ${quantity} ${ticker} — see it on your Orders page.`,
        type: "success",
      });
      setQuantity("");
      setLimitPrice("");
      setStopPrice("");
      router.refresh();
    });
  }

  const disabled = !accountId || !ticker || pending;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Trade</h1>
          {account && <MarketStatus account={account} marketOpen={marketOpen} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Place an order against real-time Alpaca data.
        </p>
      </div>

      <div className="rounded-2xl bg-accent p-6">
        <Form
          className="space-y-5 rounded-xl bg-card p-6"
          onSubmit={handleSubmit}
        >
          {/* Row 1: Account picker */}
          <Field>
            <FieldLabel>Account</FieldLabel>
            <Select
              value={accountId ? String(accountId) : ""}
              onValueChange={(v) => handleAccountChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account">
                  {(v) => {
                    const a = accounts.find((x) => String(x.id) === v);
                    if (!a) return "Select an account";
                    return (
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        <Badge
                          variant={a.type === "crypto" ? "warning" : "secondary"}
                          size="sm"
                        >
                          {a.type === "crypto" ? "Crypto" : "Stock"}
                        </Badge>
                        {a.isJoint && (
                          <Badge variant="outline" size="sm">
                            Joint
                          </Badge>
                        )}
                      </span>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge
                        variant={a.type === "crypto" ? "warning" : "secondary"}
                        size="sm"
                      >
                        {a.type === "crypto" ? "Crypto" : "Stock"}
                      </Badge>
                      {a.isJoint && (
                        <Badge variant="outline" size="sm">
                          Joint
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtUsd(parseFloat(a.balance))}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          {account && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Cash:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtUsd(parseFloat(account.balance))}
                </span>
              </span>
              <span>
                Reserved:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtUsd(parseFloat(account.reservedBalance))}
                </span>
              </span>
              <span>
                Available to trade:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {fmtUsd(available ?? 0)}
                </span>
              </span>
            </div>
          )}

          <Separator />

          {/* Row 2: Symbol + quote strip */}
          <div className="space-y-3">
            <Field>
              <FieldLabel>Symbol</FieldLabel>
              <SymbolSearch
                onSelect={handleSymbolSelect}
                placeholder={
                  !account
                    ? "Select an account first…"
                    : isCrypto
                      ? "Search BTC/USD, ETH/USD…"
                      : "Search AAPL, NVDA…"
                }
                size="default"
                assetClass={account ? assetClass : undefined}
                filter={(item) => {
                  if (!account) return true;
                  return account.type === "crypto"
                    ? item.assetClass === "crypto"
                    : item.assetClass === "us_equity";
                }}
              />
            </Field>

            {ticker && (
              <QuoteStrip
                ticker={ticker}
                name={tickerName}
                price={quote?.price ?? null}
                change={quote?.change ?? null}
                changePercent={quote?.change_percent ?? null}
                bid={quote?.bid_price ?? null}
                ask={quote?.ask_price ?? null}
                loading={quoteLoading && !liveQuote}
              />
            )}
          </div>

          {offHoursStockGuard && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <WarningCircle className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" />
              <div>
                US markets are closed. Your order will sit open until the next
                trading session — use{" "}
                <span className="font-medium">Good-til-Canceled</span> to stay
                open until filled, or <span className="font-medium">On the Open</span>
                {" "}/ <span className="font-medium">On the Close</span> to fill
                at the next session boundary. Alpaca only feeds regular-hours
                data, so fills happen when the market reopens.
              </div>
            </div>
          )}

          <Separator />

          {/* Row 3: Action / Qty / Order type / prices */}
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
            <Field>
              <FieldLabel>Action</FieldLabel>
              <Select value={side} onValueChange={(v) => setSide(v as Side)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectPopup>
              </Select>
            </Field>

            <Field>
              <FieldLabel>
                {quantityUnit === "dollars" ? "Amount (USD)" : "Quantity"}
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={quantityUnit === "dollars" ? "$0.00" : "0"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={quantityUnit}
                  onValueChange={(v) => {
                    setQuantityUnit(v as "shares" | "dollars");
                    // Clearing avoids misinterpreting the old number as the new unit.
                    setQuantity("");
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="shares">Shares</SelectItem>
                    <SelectItem value="dollars">Dollars</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              {quantityUnit === "dollars" && Number.isFinite(sharesFromInput) && sharesFromInput > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  ≈ {sharesFromInput.toFixed(6).replace(/\.?0+$/, "")} shares at{" "}
                  ${referencePrice.toFixed(2)}
                </p>
              )}
              {side === "sell" && accountId && ticker && quantityUnit === "shares" && (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Owned:{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {holdingsByAccount[accountId]?.[ticker]
                        ? parseFloat(holdingsByAccount[accountId][ticker])
                        : 0}
                    </span>
                  </span>
                  {holdingsByAccount[accountId]?.[ticker] && (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() =>
                        setQuantity(
                          holdingsByAccount[accountId][ticker],
                        )
                      }
                    >
                      Max
                    </button>
                  )}
                </div>
              )}
            </Field>

            <Field>
              <FieldLabel>Order Type</FieldLabel>
              <Select
                value={orderType}
                onValueChange={(v) => {
                  const next = v as OrderType;
                  setOrderType(next);
                  // off-hours: switching TO market while TIF is GTC would be
                  // an invalid combo — pick OPG as a sensible default.
                  if (offHoursStockGuard && next === "market" && timeInForce === "gtc") {
                    setTimeInForce("opg");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {availableOrderTypes.map((ot) => (
                    <SelectItem key={ot.value} value={ot.value}>
                      {ot.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>

            {(orderType === "stop" || orderType === "stop_limit") && (
              <Field>
                <FieldLabel>Stop Price</FieldLabel>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                />
              </Field>
            )}

            {(orderType === "limit" || orderType === "stop_limit") && (
              <Field>
                <FieldLabel>Limit Price</FieldLabel>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                />
              </Field>
            )}
          </div>

          {/* Row 4: TIF (equity only) */}
          {!isCrypto && (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
              <Field>
                <FieldLabel>Time in Force</FieldLabel>
                <Select
                  value={timeInForce}
                  onValueChange={(v) => {
                    const next = v as TimeInForce;
                    setTimeInForce(next);
                    // off-hours: switching TO GTC while order type is Market
                    // would be an invalid combo — drop to Limit.
                    if (offHoursStockGuard && next === "gtc" && orderType === "market") {
                      setOrderType("limit");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {availableTifs.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
          )}

          <Separator />

          {/* Estimated total + submit */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                Estimated order value
              </span>
              <span className="text-base font-semibold tabular-nums">
                {Number.isFinite(estimatedTotal)
                  ? fmtUsd(estimatedTotal)
                  : "—"}
              </span>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Orders appear on your{" "}
                <Link href="/orders" className="underline hover:text-foreground">
                  Orders
                </Link>{" "}
                page once placed.
              </p>
              <Button
                type="submit"
                size="lg"
                variant={side === "buy" ? "default" : "destructive"}
                disabled={disabled}
                className={cn(disabled && "opacity-64")}
              >
                {pending && <ArrowClockwise className="size-4 animate-spin" />}
                Place {side} order
              </Button>
            </div>
          </div>
        </Form>
      </div>
    </div>
  );
}

function QuoteStrip({
  ticker,
  name,
  price,
  change,
  changePercent,
  bid,
  ask,
  loading,
}: {
  ticker: string;
  name?: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  bid: number | null;
  ask: number | null;
  loading?: boolean;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <div className="rounded-xl bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={`/stocks/${ticker}`}
            className="text-lg font-semibold hover:underline"
          >
            {ticker}
          </Link>
          {name && (
            <span className="text-xs text-muted-foreground">{name}</span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-base text-muted-foreground">
                <ArrowClockwise className="size-4 animate-spin" /> Loading…
              </span>
            ) : price != null ? (
              fmtUsd(price)
            ) : (
              "—"
            )}
          </span>
          {change != null && changePercent != null && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {up ? "+" : ""}
              {change.toFixed(2)} ({up ? "+" : ""}
              {changePercent.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 text-xs text-muted-foreground tabular-nums">
          <span>
            Bid{" "}
            <span className="text-foreground">
              {bid != null ? fmtUsd(bid) : "—"}
            </span>
          </span>
          <span>
            Ask{" "}
            <span className="text-foreground">
              {ask != null ? fmtUsd(ask) : "—"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function MarketStatus({
  account,
  marketOpen,
}: {
  account: TradeAccount;
  marketOpen: boolean;
}) {
  if (account.type === "crypto") {
    return (
      <div className="flex flex-col items-end gap-0.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-foreground">Open</span>
        </span>
        <span className="text-muted-foreground">Crypto trades 24/7</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "size-2 rounded-full",
            marketOpen ? "bg-emerald-500" : "bg-muted-foreground/48",
          )}
        />
        <span className="font-medium text-foreground">
          {marketOpen ? "US markets open" : "US markets closed"}
        </span>
      </span>
      <span className="text-muted-foreground">Mon–Fri, 9:30 AM–4:00 PM ET</span>
    </div>
  );
}
