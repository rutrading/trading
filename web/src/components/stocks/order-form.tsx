"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wallet } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRow,
} from "@/components/ui/number-field";
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
import { cn } from "@/lib/utils";
import type { BrokerageAccountType } from "@/lib/accounts";

export type OrderFormAccount = {
  id: number;
  name: string;
  type: BrokerageAccountType;
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
  const router = useRouter();
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

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
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
        router.refresh();
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
    <div className="rounded-2xl bg-accent p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        Place Order
      </h2>
      <Form className="space-y-4 rounded-xl bg-card p-3 sm:p-4" onSubmit={submit}>
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
              <Field>
                <FieldLabel>Account</FieldLabel>
                <Select
                  value={accountId != null ? String(accountId) : ""}
                  onValueChange={(v) => setAccountId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(value) =>
                        matchingAccounts.find((a) => String(a.id) === value)?.name ??
                        "Select account"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {matchingAccounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <Button
                type="button"
                variant={side === "buy" ? "success" : "ghost"}
                size="default"
                onClick={() => setSide("buy")}
                className={cn(side !== "buy" && "shadow-none")}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={side === "sell" ? "destructive" : "ghost"}
                size="default"
                onClick={() => setSide("sell")}
                className={cn(side !== "sell" && "shadow-none")}
              >
                Sell
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(["market", "limit", "stop"] as const).map((type) => {
                const disabled = type === "market" && offHoursStockGuard;
                return (
                  <Button
                    key={type}
                    type="button"
                    variant={orderType === type ? "secondary" : "ghost"}
                    size="sm"
                    disabled={disabled}
                    onClick={() => setOrderType(type)}
                    className={cn(
                      "capitalize",
                      orderType !== type && "shadow-none",
                    )}
                  >
                    {type}
                  </Button>
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
              <Field>
                <FieldLabel>Quantity</FieldLabel>
                <NumberField
                  id="qty"
                  min={0}
                  step={1}
                  smallStep={0.000001}
                  value={quantity === "" ? null : Number(quantity)}
                  onValueChange={(value) => setQuantity(value == null ? "" : String(value))}
                >
                  <NumberFieldRow>
                    <NumberFieldDecrement />
                    <NumberFieldGroup>
                      <NumberFieldInput placeholder="0" />
                    </NumberFieldGroup>
                    <NumberFieldIncrement />
                  </NumberFieldRow>
                </NumberField>
              </Field>

              {orderType === "limit" && (
                <Field>
                  <FieldLabel>Limit Price</FieldLabel>
                  <NumberField
                    id="limit-price"
                    min={0}
                    step={0.01}
                    value={limitPrice === "" ? null : Number(limitPrice)}
                    onValueChange={(value) => setLimitPrice(value == null ? "" : String(value))}
                  >
                    <NumberFieldRow>
                      <NumberFieldDecrement />
                      <NumberFieldGroup>
                      <NumberFieldInput
                        placeholder={referencePrice > 0 ? fmtPrice(referencePrice) : "0.00"}
                      />
                      </NumberFieldGroup>
                      <NumberFieldIncrement />
                    </NumberFieldRow>
                  </NumberField>
                </Field>
              )}

              {orderType === "stop" && (
                <Field>
                  <FieldLabel>Stop Price</FieldLabel>
                  <NumberField
                    id="stop-price"
                    min={0}
                    step={0.01}
                    value={stopPrice === "" ? null : Number(stopPrice)}
                    onValueChange={(value) => setStopPrice(value == null ? "" : String(value))}
                  >
                    <NumberFieldRow>
                      <NumberFieldDecrement />
                      <NumberFieldGroup>
                      <NumberFieldInput
                        placeholder={referencePrice > 0 ? fmtPrice(referencePrice) : "0.00"}
                      />
                      </NumberFieldGroup>
                      <NumberFieldIncrement />
                    </NumberFieldRow>
                  </NumberField>
                </Field>
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
              type="submit"
              className="w-full"
              variant={side === "buy" ? "success" : "destructive"}
              disabled={pending || (orderType === "market" && offHoursStockGuard)}
              loading={pending}
            >
              {side === "buy" ? "Buy" : "Sell"} {ticker}
            </Button>
          </>
        )}
      </Form>
    </div>
  );
};
