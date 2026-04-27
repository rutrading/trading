"use client";

import type {
  StrategyFieldDefinition,
  StrategyTemplate,
} from "@/app/actions/strategies";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type StrategyFieldValue = string | boolean;
export type StrategyFieldValues = Record<string, StrategyFieldValue>;

function FieldLabel({
  htmlFor,
  label,
  description,
}: {
  htmlFor: string;
  label: string;
  description?: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {description ? <InfoTooltip content={description} /> : null}
    </div>
  );
}

function fieldDefaultValue(value: unknown): StrategyFieldValue {
  return typeof value === "boolean" ? value : value == null ? "" : String(value);
}

export function valuesForFields(
  fields: StrategyFieldDefinition[],
  defaults: Record<string, unknown>,
  current: StrategyFieldValues = {},
): StrategyFieldValues {
  const next: StrategyFieldValues = {};
  for (const field of fields) {
    next[field.key] = current[field.key] ?? fieldDefaultValue(defaults[field.key]);
  }
  return next;
}

export function buildFieldPayload(
  fields: StrategyFieldDefinition[],
  defaults: Record<string, unknown>,
  values: StrategyFieldValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const defaultValue = defaults[field.key];
    const rawValue = values[field.key] ?? fieldDefaultValue(defaultValue);
    if (typeof defaultValue === "boolean") {
      payload[field.key] = Boolean(rawValue);
      continue;
    }
    if (typeof defaultValue === "number") {
      const nextValue = rawValue === "" ? defaultValue : Number(rawValue);
      payload[field.key] = Number.isFinite(nextValue) ? nextValue : defaultValue;
      continue;
    }
    const nextValue = typeof rawValue === "boolean" ? String(defaultValue ?? "") : String(rawValue).trim();
    payload[field.key] = nextValue === "" ? String(defaultValue ?? "") : nextValue;
  }
  return payload;
}

export function buildTemplatePayload(
  template: StrategyTemplate,
  paramValues: StrategyFieldValues,
  riskValues: StrategyFieldValues,
) {
  return {
    params_json: buildFieldPayload(
      template.params_schema_json,
      template.default_params_json,
      paramValues,
    ),
    risk_json: buildFieldPayload(
      template.risk_schema_json,
      template.default_risk_json,
      riskValues,
    ),
  };
}

type StrategyFieldGridProps = {
  fields: StrategyFieldDefinition[];
  values: StrategyFieldValues;
  onChange: (key: string, value: StrategyFieldValue) => void;
  idPrefix: string;
  className?: string;
};

export function StrategyFieldGrid({
  fields,
  values,
  onChange,
  idPrefix,
  className = "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
}: StrategyFieldGridProps) {
  if (fields.length === 0) return null;

  return (
    <div className={className}>
      {fields.map((field) => {
        const fieldId = `${idPrefix}-${field.key}`;
        if (field.kind === "boolean") {
          return (
            <div
              key={field.key}
              className="md:col-span-2 xl:col-span-4 flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3"
            >
              <Switch
                id={fieldId}
                checked={Boolean(values[field.key])}
                onCheckedChange={(checked) => onChange(field.key, checked)}
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor={fieldId} className="text-sm font-medium">
                    {field.label}
                  </Label>
                  {field.description ? <InfoTooltip content={field.description} /> : null}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={field.key} className="space-y-1">
            <FieldLabel htmlFor={fieldId} label={field.label} description={field.description} />
            <Input
              id={fieldId}
              type="number"
              min={field.min ?? undefined}
              max={field.max ?? undefined}
              step={field.step ?? undefined}
              value={String(values[field.key] ?? "")}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
