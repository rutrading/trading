"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SliderValue = number | [number, number];
export type SliderValuePosition =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "tooltip";

export interface SliderProps {
  value: SliderValue;
  onChange: (value: SliderValue) => void;
  min?: number;
  max?: number;
  step?: number;
  minStepsBetweenValues?: number;
  showSteps?: boolean;
  showValue?: boolean;
  valuePosition?: SliderValuePosition;
  formatValue?: (v: number) => string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

const toArray = (v: SliderValue): number[] => (Array.isArray(v) ? v : [v]);
const percentOf = (v: number, min: number, max: number) =>
  max === min ? 0 : ((v - min) / (max - min)) * 100;

const SECONDARY_SURFACE =
  "bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.55),0_-1px_0_rgb(0_0_0/0.06)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.2)]";

const TRACK_SURFACE =
  "bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background)),inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-1px_0_rgb(0_0_0/0.06)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.14),inset_0_-1px_0_rgb(0_0_0/0.2)]";

const FOCUS_HALO =
  "has-focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] has-focus-visible:inset-shadow-none dark:has-focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)]";

const FOCUS_HALO_SELF =
  "has-focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] dark:has-focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)]";

export function Slider(props: SliderProps): ReactNode {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const step = props.step ?? 1;
  const showValue = props.showValue ?? true;
  const valuePosition = props.valuePosition ?? "left";
  const fmt = props.formatValue ?? String;
  const values = toArray(props.value);
  const isRange = Array.isArray(props.value);

  const stepCount = props.showSteps ? Math.round((max - min) / step) + 1 : 0;
  const startPct = isRange ? percentOf(values[0], min, max) : 0;
  const endPct = percentOf(values[isRange ? 1 : 0], min, max);
  const stepMask = isRange
    ? `linear-gradient(to right, black ${Math.max(0, startPct - 1)}%, transparent ${Math.min(100, startPct + 2)}%, transparent ${Math.max(0, endPct - 2)}%, black ${Math.min(100, endPct + 1)}%)`
    : `linear-gradient(to right, transparent ${Math.max(0, endPct - 1)}%, black ${Math.min(100, endPct + 2)}%)`;

  const inline = valuePosition === "left" || valuePosition === "right";
  const stacked = valuePosition === "top" || valuePosition === "bottom";
  const hasLabel = showValue && valuePosition !== "tooltip";

  const valueText = isRange ? (
    <>
      <span className="font-medium text-foreground">{fmt(values[0])}</span>
      <span className="text-muted-foreground/50">—</span>
      <span className="font-medium text-foreground">{fmt(values[1])}</span>
    </>
  ) : (
    <span className="font-medium text-foreground">{fmt(values[0])}</span>
  );

  const inlineLabel = hasLabel && inline ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs leading-none text-muted-foreground tabular-nums whitespace-nowrap">
      {props.label ? <span>{props.label}:</span> : null}
      {valueText}
    </span>
  ) : null;

  const stackedLabel = hasLabel && stacked ? (
    <span className="flex w-full items-baseline justify-between gap-3 text-xs leading-none text-muted-foreground tabular-nums whitespace-nowrap">
      {props.label ? <span>{props.label}</span> : <span aria-hidden />}
      <span className="inline-flex items-center gap-1">{valueText}</span>
    </span>
  ) : null;

  return (
    <div
      className={cn(
        "flex w-full select-none",
        inline ? "flex-row items-center gap-3" : "flex-col gap-2",
        props.disabled && "pointer-events-none opacity-64",
        props.className,
      )}
    >
      {valuePosition === "left" ? inlineLabel : null}
      {valuePosition === "top" ? stackedLabel : null}
      <SliderPrimitive.Root
        className="group/s w-full"
        data-base-ui-swipe-ignore
        value={values}
        onValueChange={(v) => {
          if (isRange) {
            if (!Array.isArray(v) || typeof v[0] !== "number" || typeof v[1] !== "number") return;
            props.onChange([v[0], v[1]] as [number, number]);
          } else {
            const next = Array.isArray(v) ? v[0] : v;
            if (typeof next !== "number") return;
            props.onChange(next);
          }
        }}
        min={min}
        max={max}
        step={step}
        disabled={props.disabled}
        thumbCollisionBehavior="none"
        minStepsBetweenValues={props.minStepsBetweenValues}
      >
        <SliderPrimitive.Control className="relative flex h-6 w-full touch-none items-center">
          <SliderPrimitive.Track
            className={cn(
              "relative h-[18px] w-full grow overflow-hidden rounded-full",
              TRACK_SURFACE,
            )}
          >
            <SliderPrimitive.Indicator className="h-full bg-foreground/20 dark:bg-foreground/30" />
            {props.showSteps ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ WebkitMaskImage: stepMask, maskImage: stepMask }}
              >
                {Array.from({ length: stepCount }, (_, i) => {
                  if (i === 0 || i === stepCount - 1) return null;
                  const percent = (i / (stepCount - 1)) * 100;
                  return (
                    <span
                      key={i}
                      className="absolute size-[5px] rounded-full bg-muted-foreground/40"
                      style={{ left: `${percent}%`, top: "50%", translate: "-50% -50%" }}
                    />
                  );
                })}
              </div>
            ) : null}
          </SliderPrimitive.Track>
          {values.map((_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              index={index}
              className={cn(
                "block size-5 rounded-full outline-none transition-transform duration-150",
                SECONDARY_SURFACE,
                FOCUS_HALO_SELF,
                "hover:scale-110 active:scale-110",
              )}
            >
              {valuePosition === "tooltip" ? (
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background whitespace-nowrap shadow-[0_4px_12px_rgb(0_0_0/0.15)] opacity-0 translate-y-1 transition-[opacity,translate] duration-150",
                    "group-hover/s:opacity-100 group-hover/s:translate-y-0 group-focus-within/s:opacity-100 group-focus-within/s:translate-y-0 group-has-data-dragging/s:opacity-100 group-has-data-dragging/s:translate-y-0",
                  )}
                >
                  {fmt(values[index])}
                </span>
              ) : null}
            </SliderPrimitive.Thumb>
          ))}
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      {valuePosition === "right" ? inlineLabel : null}
      {valuePosition === "bottom" ? stackedLabel : null}
    </div>
  );
}

export type SliderPillVariant = "scrubber" | "pips";

export interface SliderPillProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  variant?: SliderPillVariant;
  label?: string;
  formatValue?: (v: number) => string;
  disabled?: boolean;
  className?: string;
}

export function SliderPill(props: SliderPillProps): ReactNode {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const step = props.step ?? 1;
  const variant = props.variant ?? "scrubber";
  const fmt = props.formatValue ?? String;

  const count = variant === "pips" ? Math.round((max - min) / step) + 1 : 0;
  const endPct = percentOf(props.value, min, max);
  const pipMask = `linear-gradient(to right, transparent calc(${endPct}% - 4px), black calc(${endPct}% + 4px))`;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5",
        props.disabled && "pointer-events-none opacity-64",
        props.className,
      )}
    >
      {props.label ? (
        <span className="text-xs leading-none text-muted-foreground">{props.label}</span>
      ) : null}
      <SliderPrimitive.Root
        className="group/s w-full"
        data-base-ui-swipe-ignore
        value={[props.value]}
        onValueChange={(v) => {
          const next = Array.isArray(v) ? v[0] : v;
          if (typeof next !== "number") return;
          props.onChange(next);
        }}
        min={min}
        max={max}
        step={step}
        disabled={props.disabled}
      >
        <SliderPrimitive.Control
          className={cn(
            "relative flex h-9 w-full cursor-ew-resize touch-none items-center overflow-hidden rounded-lg text-[13px] text-muted-foreground transition-shadow",
            SECONDARY_SURFACE,
            FOCUS_HALO,
          )}
        >
          <SliderPrimitive.Track className="relative h-full w-full">
            <SliderPrimitive.Indicator className="bg-foreground/12 dark:bg-foreground/22" />
            <SliderPrimitive.Thumb
              className={cn(
                "absolute top-1/2 block h-[calc(100%-12px)] w-[2px] -translate-y-1/2 rounded-full outline-none transition-colors",
                variant === "pips"
                  ? "bg-foreground"
                  : "bg-foreground/50 hover:bg-foreground/70 active:bg-foreground has-focus-visible:bg-foreground",
              )}
            />
          </SliderPrimitive.Track>

          {variant === "pips" ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 inset-x-3 flex items-center justify-between"
              style={{ WebkitMaskImage: pipMask, maskImage: pipMask }}
            >
              {Array.from({ length: count }, (_, i) => {
                const pipVal = min + i * step;
                const active = pipVal === props.value;
                const isLast = i === count - 1;
                return (
                  <span
                    key={i}
                    className={cn(
                      "block size-[5px] rounded-full transition-colors",
                      isLast ? "opacity-0" : active ? "bg-foreground" : "bg-muted-foreground/40",
                    )}
                  />
                );
              })}
            </div>
          ) : null}

          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-medium tabular-nums text-foreground">
            {fmt(props.value)}
          </span>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}

export { SliderPrimitive };
