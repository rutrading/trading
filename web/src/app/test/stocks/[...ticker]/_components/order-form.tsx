"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";

const ORDER_TYPES = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
  { value: "stop", label: "Stop" },
  { value: "stop_limit", label: "Stop Limit" },
] as const;

const TIME_IN_FORCE = [
  { value: "day", label: "Day" },
  { value: "gtc", label: "GTC" },
  { value: "opg", label: "Open" },
  { value: "cls", label: "Close" },
] as const;

type OrderType = (typeof ORDER_TYPES)[number]["value"];

export function OrderForm({ ticker, price }: { ticker: string; price: number }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const qty = parseInt(quantity) || 0;
  const estimatedTotal = orderType === "market"
    ? qty * price
    : qty * (parseFloat(limitPrice) || price);

  const showLimitPrice = orderType === "limit" || orderType === "stop_limit";
  const showStopPrice = orderType === "stop" || orderType === "stop_limit";

  return (
    <div className="rounded-2xl bg-accent p-6">
      <h2 className="mb-4 text-lg font-semibold">Trade {ticker}</h2>

      <div className="space-y-4 rounded-xl bg-card p-4">
        <Tabs value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
          <TabsList className="w-full">
            <TabsTab value="buy" className="flex-1">Buy</TabsTab>
            <TabsTab value="sell" className="flex-1">Sell</TabsTab>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Order Type</Label>
            <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {ORDER_TYPES.map((ot) => (
                  <SelectItem key={ot.value} value={ot.value}>
                    {ot.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Time in Force</Label>
            <Select defaultValue="day">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {TIME_IN_FORCE.map((tif) => (
                  <SelectItem key={tif.value} value={tif.value}>
                    {tif.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            min="1"
            step="1"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        {showLimitPrice && (
          <div className="space-y-1.5">
            <Label htmlFor="limit-price">Limit Price</Label>
            <Input
              id="limit-price"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
            />
          </div>
        )}

        {showStopPrice && (
          <div className="space-y-1.5">
            <Label htmlFor="stop-price">Stop Price</Label>
            <Input
              id="stop-price"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">Estimated Total</span>
          <span className="font-semibold tabular-nums">
            ${estimatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <Button
          className="w-full"
          variant={side === "buy" ? "default" : "destructive"}
        >
          {side === "buy" ? "Buy" : "Sell"} {ticker}
        </Button>
      </div>
    </div>
  );
}
