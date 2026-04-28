import { describe, expect, it } from "vitest";

import type { StrategyTemplate } from "@/app/actions/strategies";
import {
  buildTemplatePayload,
  valuesForFields,
} from "./strategy-template-fields";

const emaTemplate: StrategyTemplate = {
  id: "ema_crossover",
  name: "EMA Crossover",
  description: "Trend following",
  supported_timeframes: ["1Day"],
  default_params_json: {
    fast_period: 9,
    slow_period: 21,
    order_quantity: "1",
  },
  default_risk_json: {
    max_position_quantity: "100",
    max_daily_orders: 5,
    cooldown_minutes: 30,
    max_daily_notional: "10000",
    risk_per_trade: "0",
    atr_period: 14,
    atr_stop_multiplier: "2",
    allow_pyramiding: false,
  },
  params_schema_json: [
    { key: "fast_period", label: "Fast EMA", kind: "integer" },
    { key: "slow_period", label: "Slow EMA", kind: "integer" },
    { key: "order_quantity", label: "Order Qty", kind: "decimal" },
  ],
  risk_schema_json: [
    { key: "risk_per_trade", label: "Risk / Trade", kind: "decimal" },
    { key: "allow_pyramiding", label: "Allow pyramiding", kind: "boolean" },
  ],
  status: "ready",
};

const rsiTemplate: StrategyTemplate = {
  ...emaTemplate,
  id: "rsi_reversion",
  name: "RSI Mean Reversion",
  default_params_json: {
    rsi_period: 14,
    oversold_threshold: 30,
    overbought_threshold: 70,
    order_quantity: "1",
  },
  params_schema_json: [
    { key: "rsi_period", label: "RSI Period", kind: "integer" },
    { key: "oversold_threshold", label: "Oversold", kind: "integer" },
    { key: "overbought_threshold", label: "Overbought", kind: "integer" },
    { key: "order_quantity", label: "Order Qty", kind: "decimal" },
  ],
};

describe("valuesForFields", () => {
  it("preserves shared fields when switching templates", () => {
    const emaValues = valuesForFields(
      emaTemplate.params_schema_json,
      emaTemplate.default_params_json,
      { order_quantity: "3", fast_period: "12" },
    );

    const rsiValues = valuesForFields(
      rsiTemplate.params_schema_json,
      rsiTemplate.default_params_json,
      emaValues,
    );

    expect(rsiValues.order_quantity).toBe("3");
    expect(rsiValues.rsi_period).toBe("14");
    expect(rsiValues.oversold_threshold).toBe("30");
    expect(rsiValues.overbought_threshold).toBe("70");
  });
});

describe("buildTemplatePayload", () => {
  it("coerces numbers and booleans using template defaults", () => {
    const payload = buildTemplatePayload(
      emaTemplate,
      {
        fast_period: "12",
        slow_period: "30",
        order_quantity: "2.5",
      },
      {
        risk_per_trade: "250",
        allow_pyramiding: true,
      },
    );

    expect(payload.params_json).toEqual({
      fast_period: 12,
      slow_period: 30,
      order_quantity: "2.5",
    });
    expect(payload.risk_json).toEqual({
      risk_per_trade: "250",
      allow_pyramiding: true,
    });
  });
});
