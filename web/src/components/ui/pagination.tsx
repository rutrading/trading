"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { MoreHorizontalIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import { type Button, buttonVariants } from "@/components/ui/button";

export function Pagination({
  className,
  ...props
}: React.ComponentProps<"nav">): React.ReactElement {
  return (
    <nav
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      data-slot="pagination"
      {...props}
    />
  );
}

export function PaginationContent({
  className,
  layout = "row",
  ...props
}: React.ComponentProps<"ul"> & {
  /**
   * `row` (default) — flex row, items pack from the start. Use for the
   * **Numbered** pattern.
   * `spread` — full-width 3-column grid (`1fr_auto_1fr`). First item lands
   * left, middle item is true-centered, last item lands right. Use for the
   * **Status** pattern (Previous · Page X of Y · Next) — the grid keeps the
   * status text centered regardless of Previous / Next button widths.
   */
  layout?: "row" | "spread";
}): React.ReactElement {
  return (
    <ul
      className={cn(
        layout === "spread"
          ? "grid w-full grid-cols-[1fr_auto_1fr] items-center"
          : "flex flex-row items-center gap-1",
        layout === "spread" &&
          "[&>li:first-child]:justify-self-start [&>li:last-child]:justify-self-end",
        className,
      )}
      data-slot="pagination-content"
      data-layout={layout}
      {...props}
    />
  );
}

export function PaginationItem({
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return <li data-slot="pagination-item" {...props} />;
}

export type PaginationLinkProps = {
  isActive?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
} & useRender.ComponentProps<"a">;

export function PaginationLink({
  className,
  isActive,
  size = "icon",
  render,
  ...props
}: PaginationLinkProps): React.ReactElement {
  const defaultProps = {
    "aria-current": isActive ? ("page" as const) : undefined,
    className: render
      ? className
      : cn(
          buttonVariants({
            size,
            variant: isActive ? "outline" : "ghost",
          }),
          className,
        ),
    "data-active": isActive,
    "data-slot": "pagination-link",
  };

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(defaultProps, props),
    render,
  });
}

export function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>): React.ReactElement {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      className={className}
      size="default"
      {...props}
    >
      Previous
    </PaginationLink>
  );
}

export function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>): React.ReactElement {
  return (
    <PaginationLink
      aria-label="Go to next page"
      className={className}
      size="default"
      {...props}
    >
      Next
    </PaginationLink>
  );
}

export function PaginationStatus({
  className,
  current,
  total,
  ...props
}: React.ComponentProps<"span"> & {
  current: number;
  total: number;
}): React.ReactElement {
  return (
    <span
      className={cn("text-sm text-muted-foreground tabular-nums", className)}
      data-slot="pagination-status"
      {...props}
    >
      Page <span className="font-medium text-foreground">{current}</span>{" "}
      of <span className="font-medium text-foreground">{total}</span>
    </span>
  );
}

export function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-hidden
      className={cn("flex min-w-7 justify-center", className)}
      data-slot="pagination-ellipsis"
      {...props}
    >
      <MoreHorizontalIcon className="size-5 sm:size-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}
