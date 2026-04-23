"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowClockwise, Wallet } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import { useQuote } from "@/components/ws-provider";
import { placeOrder, type PlaceOrderInput } from "@/app/actions/orders";
import { fmtPrice } from "@/lib/format";

export type OrderFormAccount = {
  id: number;
  name: string;
  type: "investment" | "crypto";
  balance: string;
};

type AssetClass = "us_equity" | "crypto";
type OrderType = "market" | "limit" | "stop";
type Side = "buy" | "sell";

const fmtUsd = (n: number) => `$${fmtPrice(n)}`;

export const OrderForm = ({
  ticker,
  price,
  assetClass,
  accounts,
  marketOpen,
}: {
  ticker: string;
  price: number;
  assetClass: AssetClass;
  accounts: OrderFormAccount[];
  marketOpen: boolean;
}) => {
  // Only accounts of the matching type can trade this asset. Stocks need an
  // investment account; crypto needs a crypto account. Filtering server-side
  // would also work, but doing it here keeps the page contract simple
  // (pass *all* accounts) and lets the empty-state CTA know which kind to ask
  // the user to create.
  const matchingType: OrderFormAccount["type"] =
    assetClass === "crypto" ? "crypto" : "investment";
  const matchingAccounts = useMemo(
    () => accounts.filter((a) => a.type === matchingType),
    [accounts, matchingType],
  );

  const [accountId, setAccountId] = useState<number | undefined>(
    () => matchingAccounts[0]?.id,
  );

  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [pending, startTransition] = useTransition();

  // Live price overrides the server-snapshot `price` once the WS feed lands.
  const live = useQuote(ticker);
  const referencePrice = live?.price ?? price;

  const qty = parseFloat(quantity);
  const estimatedTotal =
    Number.isFinite(qty) && qty > 0 && referencePrice > 0
      ? qty * referencePrice
      : 0;

  const accountTypeLabel = assetClass === "crypto" ? "crypto" : "stock";
  const noMatchingAccount = matchingAccounts.length === 0;
  // Stock + off-hours + market: backend will reject `market`+`gtc`. The full
  // /trade page lets the user pick opg/cls; here we just disable Market and
  // ask them to use Limit/Stop or jump to the full form.
  const offHoursStockGuard = assetClass === "us_equity" && !marketOpen;

  const submit = () => {
    if (!accountId) return;
    if (!(qty > 0)) {
      toastManager.add({
        title: "Invalid quantity",
        description: "Enter a positive number of shares.",
        type: "error",
      });
      return;
    }
    if (orderType === "limit" && !(parseFloat(limitPrice) > 0)) {
      toastManager.add({
        title: "Limit price required",
        description: "Enter a positive limit price.",
        type: "error",
      });
      return;
    }
    if (orderType === "stop" && !(parseFloat(stopPrice) > 0)) {
      toastManager.add({
        title: "Stop price required",
        description: "Enter a positive stop price.",
        type: "error",
      });
      return;
    }

    const input: PlaceOrderInput = {
      tradingAccountId: accountId,
      ticker,
      assetClass,
      side,
      orderType,
      quantity,
      limitPrice: orderType === "limit" ? limitPrice : undefined,
      stopPrice: orderType === "stop" ? stopPrice : undefined,
    };

    startTransition(async () => {
      const res = await placeOrder(input);
      if (res.ok) {
        toastManager.add({
          title: `${side === "buy" ? "Buy" : "Sell"} order placed`,
          description: `${quantity} ${ticker} (${orderType})`,
          type: "success",
        });
        setQuantity("");
        setLimitPrice("");
        setStopPrice("");
      } else {
        toastManager.add({
          title: "Order failed",
          description: res.error,
          type: "error",
        });
      }
    });
  };

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        Place Order
      </h2>
      <div className="space-y-4 rounded-xl bg-card p-4">
        {noMatchingAccount ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              No {accountTypeLabel} account
            </p>
            <p className="text-xs text-muted-foreground">
              You need a {accountTypeLabel} account before you can trade{" "}
              {ticker}.
            </p>
            <Button variant="outline" size="sm" render={<Link href="/onboarding" />}>
              Create {accountTypeLabel} account
            </Button>
          </div>
        ) : (
          <>
            {matchingAccounts.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Account</Label>
                <Select
                  value={accountId != null ? String(accountId) : ""}
                  onValueChange={(v) => setAccountId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {matchingAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  side === "buy"
                    ? "bg-emerald-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  side === "sell"
                    ? "bg-red-500 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sell
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(["market", "limit", "stop"] as const).map((type) => {
                const disabled = type === "market" && offHoursStockGuard;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={disabled}
                    onClick={() => setOrderType(type)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      orderType === type
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>

            {offHoursStockGuard && (
              <p className="text-[11px] text-muted-foreground">
                US market is closed. Use Limit or Stop, or open the{" "}
                <Link
                  href={`/trade?ticker=${encodeURIComponent(ticker)}${accountId ? `&account=${accountId}` : ""}`}
                  className="text-primary hover:underline"
                >
                  full trade form
                </Link>{" "}
                for opg/cls orders.
              </p>
            )}

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="qty" className="text-xs">
                  Quantity
                </Label>
                <Input
                  id="qty"
                  type="number"
                  placeholder="0"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {orderType === "limit" && (
                <div className="space-y-1.5">
                  <Label htmlFor="limit-price" className="text-xs">
                    Limit Price
                  </Label>
                  <Input
                    id="limit-price"
                    type="number"
                    placeholder={referencePrice > 0 ? fmtPrice(referencePrice) : "0.00"}
                    min="0"
                    step="any"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                  />
                </div>
              )}

              {orderType === "stop" && (
                <div className="space-y-1.5">
                  <Label htmlFor="stop-price" className="text-xs">
                    Stop Price
                  </Label>
                  <Input
                    id="stop-price"
                    type="number"
                    placeholder={referencePrice > 0 ? fmtPrice(referencePrice) : "0.00"}
                    min="0"
                    step="any"
                    value={stopPrice}
                    onChange={(e) => setStopPrice(e.target.value)}
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Market Price</span>
                <span className="font-medium tabular-nums">
                  {referencePrice > 0 ? fmtUsd(referencePrice) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Total</span>
                <span className="font-medium tabular-nums">
                  {fmtUsd(estimatedTotal)}
                </span>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              variant={side === "buy" ? "default" : "destructive"}
              disabled={pending || (orderType === "market" && offHoursStockGuard)}
              onClick={submit}
            >
              {pending && <ArrowClockwise className="size-4 animate-spin" />}
              {side === "buy" ? "Buy" : "Sell"} {ticker}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
