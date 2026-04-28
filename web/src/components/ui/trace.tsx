"use client";

import { ChevronDown } from "lucide-react";
import type * as React from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type TraceStatus = "done" | "running" | "queued" | "failed";

export type TraceStep = {
  id: string;
  label: string;
  startMs: number;
  durationMs: number;
  status?: TraceStatus;
  active?: boolean;
  children?: TraceStep[];
};

export type TraceProps = {
  totalMs: number;
  steps: TraceStep[];
  /** px the next top-level step indents past the previous one. Default 14. */
  cascadePx?: number;
  /** label-column width in px. Default 320. */
  labelColPx?: number;
  /** Optional content rendered in the timeline header above the cascade. */
  title?: React.ReactNode;
  className?: string;
};

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export const formatTraceDuration = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s` : `${ms}ms`;

const statusBg = (status?: TraceStatus): string => {
  switch (status) {
    case "running":
      return "bg-info";
    case "queued":
      return "bg-muted-foreground/40";
    case "failed":
      return "bg-destructive";
    default:
      return "bg-success";
  }
};

export const Trace = (props: TraceProps) => {
  const cascadePx = props.cascadePx ?? 14;
  const labelCol = `${props.labelColPx ?? 320}px`;
  return (
    <div className={cn("flex flex-col gap-2", props.className)}>
      <Header totalMs={props.totalMs} labelCol={labelCol} title={props.title} />
      <ul className="relative flex flex-col gap-0.5">
        <Gridlines labelCol={labelCol} />
        {props.steps.map((s, i) => (
          <Row
            key={s.id}
            step={s}
            indent={i * cascadePx}
            totalMs={props.totalMs}
            labelCol={labelCol}
          />
        ))}
      </ul>
    </div>
  );
};

const Header = (props: {
  totalMs: number;
  labelCol: string;
  title?: React.ReactNode;
}) => (
  <div
    className="grid items-end gap-3 text-muted-foreground text-[11px] tabular-nums"
    style={{ gridTemplateColumns: `${props.labelCol} 1fr` }}
  >
    <div>{props.title}</div>
    <div className="relative">
      <div className="flex items-baseline justify-between">
        {TICKS.map((t) => (
          <span key={t}>{formatTraceDuration(props.totalMs * t)}</span>
        ))}
      </div>
      <div className="mt-1 flex justify-between">
        {TICKS.map((t) => (
          <span key={t} className="h-1.5 w-px bg-border" />
        ))}
      </div>
    </div>
  </div>
);

const Gridlines = (props: { labelCol: string }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 right-0"
    style={{ left: `calc(${props.labelCol} + 0.75rem)` }}
  >
    {TICKS.map((t) => (
      <span
        key={t}
        className="absolute inset-y-0 w-px border-border border-l border-dotted"
        style={{ left: `${t * 100}%` }}
      />
    ))}
  </div>
);

const Bar = (props: {
  step: TraceStep;
  totalMs: number;
  faded?: boolean;
}) => {
  const left = (props.step.startMs / props.totalMs) * 100;
  const width = Math.max((props.step.durationMs / props.totalMs) * 100, 0.5);
  return (
    <div className="relative h-2 w-full">
      <div
        className={cn(
          "absolute inset-y-0 rounded-sm",
          props.faded ? "bg-foreground/35" : statusBg(props.step.status),
        )}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
};

type RowProps = {
  step: TraceStep;
  indent: number;
  totalMs: number;
  labelCol: string;
};

const Row = (props: RowProps) => {
  if (props.step.children?.length) return <Group {...props} />;
  return <Leaf {...props} />;
};

const Leaf = (props: RowProps) => (
  <li>
    <button
      type="button"
      className={cn(
        "grid h-8 w-full items-center gap-3 rounded-md text-left outline-hidden hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]",
        props.step.active && "bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]",
      )}
      style={{ gridTemplateColumns: `${props.labelCol} 1fr` }}
    >
      <span
        className="flex items-baseline gap-1.5"
        style={{ paddingLeft: `${props.indent}px` }}
      >
        <span className="size-3.5 shrink-0" />
        <span
          className={cn(
            "truncate font-mono text-foreground text-sm",
            props.step.active && "font-medium",
          )}
        >
          {props.step.label}
        </span>
        <span className="ms-1 text-muted-foreground/70 text-xs tabular-nums">
          {formatTraceDuration(props.step.durationMs)}
        </span>
      </span>
      <Bar step={props.step} totalMs={props.totalMs} />
    </button>
  </li>
);

const Group = (props: RowProps) => {
  const children = props.step.children ?? [];
  return (
    <li>
      <Collapsible defaultOpen>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="grid h-8 w-full items-center gap-3 rounded-md text-left outline-hidden hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)] [&:not([data-panel-open])_.chev]:-rotate-90"
              style={{ gridTemplateColumns: `${props.labelCol} 1fr` }}
            />
          }
        >
          <span
            className="flex items-baseline gap-1.5"
            style={{ paddingLeft: `${props.indent}px` }}
          >
            <ChevronDown className="chev size-3.5 shrink-0 self-center opacity-60 transition-transform" />
            <span className="truncate font-mono text-foreground text-sm">
              {props.step.label}
            </span>
            <span className="ms-1 text-muted-foreground/70 text-xs tabular-nums">
              {formatTraceDuration(props.step.durationMs)}
            </span>
          </span>
          <div className="transition-opacity duration-200 ease-out [[data-panel-open]_&]:opacity-0 motion-reduce:transition-none">
            <Bar step={props.step} totalMs={props.totalMs} faded />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className="flex flex-col gap-0.5">
            {children.map((c) => (
              <ChildRow
                key={c.id}
                step={c}
                indent={props.indent}
                totalMs={props.totalMs}
                labelCol={props.labelCol}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
};

const ChildRow = (props: RowProps) => (
  <li>
    <button
      type="button"
      className={cn(
        "grid h-8 w-full items-center gap-3 rounded-md text-left outline-hidden hover:bg-[color-mix(in_srgb,var(--foreground)_5%,transparent)]",
        props.step.active && "bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]",
      )}
      style={{ gridTemplateColumns: `${props.labelCol} 1fr` }}
    >
      <span
        className="flex items-baseline gap-1.5"
        style={{ paddingLeft: `${props.indent}px` }}
      >
        <span className="size-3.5 shrink-0" />
        <span
          className={cn(
            "truncate font-mono text-foreground/75 text-xs",
            props.step.active && "font-medium",
          )}
        >
          {props.step.label}
        </span>
        <span className="ms-1 text-muted-foreground/70 text-xs tabular-nums">
          {formatTraceDuration(props.step.durationMs)}
        </span>
      </span>
      <Bar step={props.step} totalMs={props.totalMs} />
    </button>
  </li>
);
