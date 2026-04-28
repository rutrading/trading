import type * as React from "react";
import { cn } from "@/lib/utils";

export const Empty = (props: React.ComponentProps<"div">) => (
  <div
    data-slot="empty"
    {...props}
    className={cn(
      "flex min-w-0 flex-col items-center justify-center gap-4 text-balance px-6 py-12 text-center md:py-16",
      props.className,
    )}
  />
);

/**
 * Pure positioning slot. Drops whatever you put inside it directly above
 * the title with consistent spacing. No built-in chrome — pass an icon, an
 * SVG, a custom decorated block, or omit the slot entirely.
 */
export const EmptyMedia = (props: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-media"
    {...props}
    className={cn(
      "flex shrink-0 items-center justify-center pb-2",
      props.className,
    )}
  />
);

export const EmptyTitle = (props: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-title"
    {...props}
    className={cn("font-heading font-semibold text-lg", props.className)}
  />
);

export const EmptyDescription = (props: React.ComponentProps<"p">) => (
  <p
    data-slot="empty-description"
    {...props}
    className={cn(
      "max-w-sm text-muted-foreground text-sm",
      props.className,
    )}
  />
);

/**
 * Horizontal row of CTAs below the description. Wraps on narrow viewports.
 * Convention: secondary on the left, primary on the right.
 */
export const EmptyActions = (props: React.ComponentProps<"div">) => (
  <div
    data-slot="empty-actions"
    {...props}
    className={cn(
      "flex flex-wrap items-center justify-center gap-2 pt-2",
      props.className,
    )}
  />
);
