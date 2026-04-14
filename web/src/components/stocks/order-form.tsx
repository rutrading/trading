"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toastManager } from "@/components/ui/toast";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OrderForm = ({ ticker, price }: { ticker: string; price: number }) => {
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  const qty = parseInt(quantity) || 0;
  const estimatedTotal = qty * price;

  const handlePlaceOrder = () => {
    if (qty <= 0) {
      toastManager.add({
        title: "Invalid quantity",
        description: "Please enter a positive number.",
        type: "error",
      });
      return;
    }

    const verb = orderSide === "buy" ? "Buy" : "Sell";
    toastManager.add({
      title: `${verb} order placed`,
      description: `${qty} ${qty === 1 ? "share" : "shares"} of ${ticker}`,
      type: "info",
    });
    setQuantity("");
    setLimitPrice("");
  };

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Place Order</h2>
      <div className="space-y-4 rounded-xl bg-card p-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setOrderSide("buy")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              orderSide === "buy"
                ? "bg-emerald-500 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setOrderSide("sell")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              orderSide === "sell"
                ? "bg-red-500 text-white"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {["market", "limit", "stop"].map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                orderType === type
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qty" className="text-xs">Quantity</Label>
            <Input
              id="qty"
              type="number"
              placeholder="0"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {orderType !== "market" && (
            <div className="space-y-1.5">
              <Label htmlFor="price" className="text-xs">
                {orderType === "limit" ? "Limit Price" : "Stop Price"}
              </Label>
              <Input
                id="price"
                type="number"
                placeholder={fmt(price)}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Market Price</span>
            <span className="font-medium tabular-nums">${fmt(price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Est. Total</span>
            <span className="font-medium tabular-nums">${fmt(estimatedTotal)}</span>
          </div>
        </div>

        <Button
          className="w-full"
          variant={orderSide === "buy" ? "default" : "destructive"}
          onClick={handlePlaceOrder}
        >
          {orderSide === "buy" ? "Buy" : "Sell"} {ticker}
        </Button>
      </div>
    </div>
  );
};
