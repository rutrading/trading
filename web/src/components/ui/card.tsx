"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type React from "react";
import { cn } from "@/lib/utils";

const CARD_BASE =
  "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[inset_0_1px_2px_rgb(0_0_0/0.06),inset_0_-1px_2px_rgb(0_0_0/0.04)] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.3),inset_0_-1px_2px_rgb(0_0_0/0.2)]";

export function Card({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(CARD_BASE, className),
    "data-slot": "card",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

const FRAME =
  "rounded-[calc(var(--radius-2xl)+0.25rem)] bg-card border border-border shadow-xs/5 p-1 flex flex-col";

const FRAME_INNER =
  "relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-muted/72 text-card-foreground shadow-[inset_0_2px_6px_rgb(0_0_0/0.08)] dark:shadow-[inset_0_2px_6px_rgb(0_0_0/0.4)]";

export function CardFrame({
  className,
  children,
  innerClassName,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  innerClassName?: string;
}): React.ReactElement {
  const defaultProps = {
    className: cn(FRAME, className),
    "data-slot": "card-frame",
    children: (
      <div className={cn(FRAME_INNER, innerClassName)} data-slot="card-frame-inner">
        {children}
      </div>
    ),
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardHeader({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 p-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] in-[[data-slot=card]:has(>[data-slot=card-panel])]:pb-4 in-[[data-slot=card-frame-inner]:has(>[data-slot=card-panel])]:pb-4",
      className,
    ),
    "data-slot": "card-header",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardTitle({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("font-semibold text-base leading-none", className),
    "data-slot": "card-title",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardDescription({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("text-muted-foreground text-sm", className),
    "data-slot": "card-description",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "col-start-2 row-span-2 row-start-1 inline-flex self-start justify-self-end",
      className,
    ),
    "data-slot": "card-action",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardPanel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex-1 p-6 in-[[data-slot=card]:has(>[data-slot=card-header])]:pt-0 in-[[data-slot=card-frame-inner]:has(>[data-slot=card-header])]:pt-0 in-[[data-slot=card]:has(>[data-slot=card-action-row])]:pb-4 in-[[data-slot=card-frame-inner]:has(>[data-slot=card-action-row])]:pb-4",
      className,
    ),
    "data-slot": "card-panel",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardFooter({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex items-center p-6 in-[[data-slot=card]:has(>[data-slot=card-panel])]:pt-4 in-[[data-slot=card-frame-inner]:has(>[data-slot=card-panel])]:pt-4",
      className,
    ),
    "data-slot": "card-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

/**
 * Footer-style row of bordered actions, separated by hairline dividers.
 * Pair with `CardActionButton`. Sits at the bottom of a Card / CardFrame.
 */
export function CardActionRow({
  className,
  children,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const childArray = Array.isArray(children) ? children : [children];
  const withDividers: React.ReactNode[] = [];
  childArray.forEach((child, i) => {
    if (child === null || child === undefined || child === false) return;
    if (withDividers.length > 0) {
      withDividers.push(
        <div
          key={`divider-${i}`}
          aria-hidden
          className="h-4 w-px bg-border"
        />,
      );
    }
    withDividers.push(child);
  });

  const defaultProps = {
    className: cn(
      "relative flex items-center border-t border-border bg-background/64",
      className,
    ),
    "data-slot": "card-action-row",
    children: withDividers,
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function CardActionButton({
  className,
  destructive,
  render,
  ...props
}: useRender.ComponentProps<"button"> & {
  destructive?: boolean;
}): React.ReactElement {
  const defaultProps = {
    type: "button" as const,
    className: cn(
      "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-64",
      destructive
        ? "text-destructive-foreground hover:bg-destructive/10"
        : "text-foreground hover:bg-accent",
      className,
    ),
    "data-slot": "card-action-button",
    "data-destructive": destructive ? "" : undefined,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export { CardPanel as CardContent };
