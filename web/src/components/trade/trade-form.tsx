"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { SymbolSearch, type SymbolItem } from "@/components/symbol-search";
import { useQuote } from "@/components/ws-provider";
import { placeOrder } from "@/app/actions/orders";
import { mergeQuote, type Quote } from "@/lib/quote";
import { cn } from "@/lib/utils";
import { fmtPrice } from "@/lib/format";
import { dollarsToShares } from "@/lib/order-math";

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
const SIDE_LABELS: Record<Side, string> = { buy: "Buy", sell: "Sell" };
const QUANTITY_UNIT_LABELS: Record<"shares" | "dollars", string> = {
  shares: "Shares",
  dollars: "Dollars",
};
const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop Limit",
};
const TIF_LABELS: Record<TimeInForce, string> = {
  day: "Day",
  gtc: "Good-til-Canceled",
  opg: "On the Open",
  cls: "On the Close",
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

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

  const accountId = initialAccountId;

  const [ticker, setTicker] = useState<string | undefined>(initialTicker);
  const [tickerName, setTickerName] = useState<string | undefined>(undefined);

  const [side, setSide] = useState<Side>(() =>
    oneOf(searchParams.get("side"), ["buy", "sell"], "buy"),
  );
  const [orderType, setOrderType] = useState<OrderType>(() =>
    oneOf(searchParams.get("orderType"), ["market", "limit", "stop", "stop_limit"], "market"),
  );
  const [timeInForce, setTimeInForce] = useState<TimeInForce>(() =>
    oneOf(searchParams.get("tif"), ["day", "gtc", "opg", "cls"], "gtc"),
  );
  const [quantity, setQuantity] = useState(() => searchParams.get("qty") ?? "");
  const [quantityUnit, setQuantityUnit] = useState<"shares" | "dollars">(() =>
    oneOf(searchParams.get("unit"), ["shares", "dollars"], "shares"),
  );
  const [limitPrice, setLimitPrice] = useState(() => searchParams.get("limit") ?? "");
  const [stopPrice, setStopPrice] = useState(() => searchParams.get("stop") ?? "");

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
  const [snapshot, setSnapshot] = useState<Quote | null>(null);
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
        setSnapshot(body?.ok ? (body.data as Quote) : null);
        setQuoteLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setSnapshot(null);
        setQuoteLoading(false);
      });
    return () => controller.abort();
  }, [ticker]);

  const quote = mergeQuote(snapshot, liveQuote);

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
        : (quote.price ?? NaN);
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
    ticker?: string | null;
    side?: Side;
    orderType?: OrderType;
    timeInForce?: TimeInForce;
    quantity?: string;
    quantityUnit?: "shares" | "dollars";
    limitPrice?: string;
    stopPrice?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.ticker === null) params.delete("ticker");
    else if (next.ticker !== undefined) params.set("ticker", next.ticker);
    if (next.side !== undefined) params.set("side", next.side);
    if (next.orderType !== undefined) params.set("orderType", next.orderType);
    if (next.timeInForce !== undefined) params.set("tif", next.timeInForce);
    if (next.quantity !== undefined) {
      if (next.quantity) params.set("qty", next.quantity);
      else params.delete("qty");
    }
    if (next.quantityUnit !== undefined) params.set("unit", next.quantityUnit);
    if (next.limitPrice !== undefined) {
      if (next.limitPrice) params.set("limit", next.limitPrice);
      else params.delete("limit");
    }
    if (next.stopPrice !== undefined) {
      if (next.stopPrice) params.set("stop", next.stopPrice);
      else params.delete("stop");
    }
    router.replace(`/trade?${params.toString()}`);
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

    // Affordability / sellable-quantity guard — server is still source of
    // truth, but give the user immediate feedback before the round trip.
    if (side === "buy") {
      if (
        Number.isFinite(estimatedTotal) &&
        available !== undefined &&
        estimatedTotal > available
      ) {
        setError(
          `Estimated order value (${fmtUsd(estimatedTotal)}) exceeds available cash (${fmtUsd(available)}).`,
        );
        return;
      }
    } else {
      const ownedStr = holdingsByAccount[accountId]?.[ticker];
      const owned = ownedStr ? parseFloat(ownedStr) : 0;
      if (Number.isFinite(sharesFromInput) && sharesFromInput > owned) {
        setError(
          `You can sell at most ${owned} ${ticker} from this account.`,
        );
        return;
      }
    }

    // Backend takes shares only; convert when the user picked Dollars.
    let sharesToSubmit: string;
    if (quantityUnit === "dollars") {
      const result = dollarsToShares(qtyNum, referencePrice);
      if (!result.ok) {
        setError(
          "Amount is too small to buy any shares at this price. Increase the dollar amount.",
        );
        return;
      }
      sharesToSubmit = result.shares;
    } else {
      sharesToSubmit = quantity;
    }

    // Buys that the backend has to compute ATR for can take ~10s on the
    // first placement of a ticker (cold DB → synchronous Alpaca fetch).
    // Show a "Calculating risk..." toast if the request hasn't returned in
    // ~1s so the form doesn't feel frozen. Subsequent placements hit the
    // DB cache and never trip the timer.
    const needsAtr =
      side === "buy" &&
      (orderType === "stop" ||
        (orderType === "market" &&
          !isCrypto &&
          (timeInForce === "opg" || timeInForce === "cls")));
    let pendingToastId: string | null = null;
    const pendingToastTimer = needsAtr
      ? window.setTimeout(() => {
          pendingToastId = toastManager.add({
            title: "Calculating risk…",
            description: "Looking up recent volatility for this ticker.",
            type: "loading",
          });
        }, 1000)
      : null;

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

      if (pendingToastTimer != null) window.clearTimeout(pendingToastTimer);
      if (pendingToastId != null) toastManager.close(pendingToastId);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      const filled = res.data.status === "filled";
      const description =
        quantityUnit === "dollars"
          ? `${side.toUpperCase()} ${fmtUsd(qtyNum)} of ${ticker} (~${sharesToSubmit} sh) — see it on your Orders page.`
          : `${side.toUpperCase()} ${quantity} ${ticker} — see it on your Orders page.`;
      toastManager.add({
        title: filled ? "Order filled" : "Order placed",
        description,
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
      <PageHeader divider={false} className="h-auto px-0 pb-2">
        <div className="flex w-full items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Trade</h1>
            <p className="text-sm text-muted-foreground">
              Place an order against real-time Alpaca data.
            </p>
          </div>
          {account && <MarketStatus account={account} marketOpen={marketOpen} />}
        </div>
      </PageHeader>

      <div className="rounded-2xl bg-accent p-6">
        <Form
          className="space-y-5 rounded-xl bg-card p-6"
          onSubmit={handleSubmit}
        >
          {account && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Account: <span className="font-medium text-foreground">{account.name}</span>
              </span>
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
                requireQuoteable={Boolean(account)}
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
                price={quote.price ?? null}
                change={quote.change ?? null}
                changePercent={quote.change_percent ?? null}
                bid={quote.bid_price ?? null}
                ask={quote.ask_price ?? null}
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

          <div className="grid gap-4 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(22rem,2fr)]">
            <Field>
              <FieldLabel>Action</FieldLabel>
              <Select
                value={side}
                onValueChange={(v) => {
                  const next = v as Side;
                  setSide(next);
                  syncUrl({ side: next });
                }}
              >
                <SelectTrigger>
                  <SelectValue>{(value) => SIDE_LABELS[value as Side]}</SelectValue>
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
              <div className="flex min-w-0 gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={quantityUnit === "dollars" ? "$0.00" : "0"}
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    syncUrl({ quantity: e.target.value });
                  }}
                  className="min-w-0 flex-1"
                />
                <Select
                  value={quantityUnit}
                  onValueChange={(v) => {
                    const nextUnit = v as "shares" | "dollars";
                    if (nextUnit === quantityUnit) return;
                    let nextQuantity = "";
                    // Convert the existing value across units so the user
                    // doesn't lose their typed amount on a unit toggle.
                    if (
                      quantity &&
                      Number.isFinite(qtyNum) &&
                      qtyNum > 0 &&
                      Number.isFinite(referencePrice) &&
                      referencePrice > 0
                    ) {
                      nextQuantity =
                        nextUnit === "dollars"
                          ? (qtyNum * referencePrice).toFixed(2)
                          : (qtyNum / referencePrice)
                              .toFixed(8)
                              .replace(/\.?0+$/, "");
                    }
                    setQuantity(nextQuantity);
                    setQuantityUnit(nextUnit);
                    syncUrl({ quantity: nextQuantity, quantityUnit: nextUnit });
                  }}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue>
                      {(value) => QUANTITY_UNIT_LABELS[value as "shares" | "dollars"]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="shares">Shares</SelectItem>
                    <SelectItem value="dollars">Dollars</SelectItem>
                  </SelectPopup>
                </Select>
              </div>
              {quantityUnit === "dollars" && Number.isFinite(sharesFromInput) && sharesFromInput > 0 && (() => {
                // Same trim as the submit, but fall back to a wider precision
                // so sub-cent crypto orders don't render "≈ 0 shares".
                const trimmed = sharesFromInput.toFixed(6).replace(/\.?0+$/, "");
                const display = trimmed && parseFloat(trimmed) > 0
                  ? trimmed
                  : sharesFromInput.toFixed(8).replace(/\.?0+$/, "");
                return (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    ≈ {display || "0"} shares at {fmtUsd(referencePrice)}
                  </p>
                );
              })()}
              {side === "sell" && accountId && ticker && (() => {
                const ownedStr = holdingsByAccount[accountId]?.[ticker];
                // Guard against empty / "0" / NaN — fully reserved positions
                // can be stringified as "0" but there's nothing to sell.
                const owned = ownedStr ? parseFloat(ownedStr) : 0;
                if (!(owned > 0)) return null;
                const ownedDollars =
                  Number.isFinite(referencePrice) && referencePrice > 0
                    ? owned * referencePrice
                    : null;
                return (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Owned:{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {quantityUnit === "dollars" && ownedDollars != null
                          ? fmtUsd(ownedDollars)
                          : owned}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        if (quantityUnit === "dollars" && ownedDollars != null) {
                          const nextQuantity = ownedDollars.toFixed(2);
                          setQuantity(nextQuantity);
                          syncUrl({ quantity: nextQuantity });
                        } else {
                          const nextQuantity = String(owned);
                          setQuantity(nextQuantity);
                          syncUrl({ quantity: nextQuantity });
                        }
                      }}
                    >
                      Max
                    </button>
                  </div>
                );
              })()}
            </Field>

          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel>Order Type</FieldLabel>
              <Select
                value={orderType}
                onValueChange={(v) => {
                  const next = v as OrderType;
                  setOrderType(next);
                  syncUrl({ orderType: next });
                  // off-hours: switching TO market while TIF is GTC would be
                  // an invalid combo — pick OPG as a sensible default.
                  if (offHoursStockGuard && next === "market" && timeInForce === "gtc") {
                    setTimeInForce("opg");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(value) => ORDER_TYPE_LABELS[value as OrderType]}
                  </SelectValue>
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
                  onChange={(e) => {
                    setStopPrice(e.target.value);
                    syncUrl({ stopPrice: e.target.value });
                  }}
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
                  onChange={(e) => {
                    setLimitPrice(e.target.value);
                    syncUrl({ limitPrice: e.target.value });
                  }}
                />
              </Field>
            )}
          </div>

          {/* Row 4: TIF (equity only) */}
          {!isCrypto && (
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>Time in Force</FieldLabel>
                <Select
                  value={timeInForce}
                  onValueChange={(v) => {
                    const next = v as TimeInForce;
                    setTimeInForce(next);
                    syncUrl({ timeInForce: next });
                    // off-hours: switching TO GTC while order type is Market
                    // would be an invalid combo — drop to Limit.
                    if (offHoursStockGuard && next === "gtc" && orderType === "market") {
                      setOrderType("limit");
                    }
                  }}
                >
                <SelectTrigger>
                    <SelectValue>
                      {(value) => TIF_LABELS[value as TimeInForce]}
                    </SelectValue>
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
                Estimated order value{" "}
                <span className="text-xs">(excludes slippage / fees)</span>
              </span>
              <span className="text-base font-semibold tabular-nums">
                {Number.isFinite(estimatedTotal)
                  ? fmtUsd(estimatedTotal)
                  : "—"}
              </span>
            </div>
            {orderType === "market" && (marketOpen || isCrypto) ? (
              <p className="text-xs text-muted-foreground">
                Market prices can move before the order fills; purchasing power is checked again when submitted.
              </p>
            ) : null}

            {error && (
              <div
                id="trade-form-error"
                role="alert"
                aria-live="polite"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
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
                variant={side === "buy" ? "success" : "destructive"}
                disabled={disabled}
                loading={pending}
                aria-describedby={error ? "trade-form-error" : undefined}
                className={cn(disabled && "opacity-64")}
              >
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
    <div className="rounded-xl border border-border/64 bg-muted/28 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/stocks/${ticker}`}
            className="text-base font-semibold tracking-tight hover:underline"
          >
            {ticker}
          </Link>
          {name && (
            <p className="truncate text-xs text-muted-foreground">{name}</p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 sm:justify-end">
          <div className="text-right sm:min-w-32">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Last
            </div>
            <div className="text-xl font-semibold tabular-nums">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Loading
              </span>
            ) : price != null ? (
              fmtUsd(price)
            ) : (
              "—"
            )}
            </div>
          {change != null && changePercent != null && (
            <div
              className={cn(
                "text-xs font-medium tabular-nums",
                up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {up ? "+" : ""}
              {change.toFixed(2)} ({up ? "+" : ""}
              {changePercent.toFixed(2)}%)
            </div>
          )}
          </div>
          <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/64 bg-background/60 text-xs tabular-nums">
            <div className="min-w-24 px-3 py-2">
              <div className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Bid
              </div>
              <div className="mt-0.5 font-semibold text-foreground">
                {bid != null ? fmtUsd(bid) : "—"}
              </div>
            </div>
            <div className="min-w-24 border-l border-border/64 px-3 py-2">
              <div className="font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Ask
              </div>
              <div className="mt-0.5 font-semibold text-foreground">
                {ask != null ? fmtUsd(ask) : "—"}
              </div>
            </div>
          </div>
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
      <div className="flex flex-col items-end gap-1 text-right">
        <div className="text-xs font-medium text-foreground">Crypto market</div>
        <Badge variant="success">Open 24/7</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <div className="text-xs font-medium text-foreground">US markets</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant={marketOpen ? "success" : "zinc"}>
          {marketOpen ? "Open" : "Closed"}
        </Badge>
        <span className="text-xs text-muted-foreground">9:30 AM-4:00 PM ET</span>
      </div>
    </div>
  );
}
