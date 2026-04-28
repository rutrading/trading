import type React from "react";
import { cn } from "@/lib/utils";

// Wave-pulse: horizontal light sweep + opacity breathing running at the
// same time on a tinted track that matches the Progress component.
export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-sm animate-skeleton-breathe [--skeleton-highlight:--alpha(var(--color-white)/64%)] [--skeleton-track:color-mix(in_srgb,var(--foreground)_14%,var(--background))] [background:linear-gradient(90deg,transparent_25%,var(--skeleton-highlight),transparent_75%)_var(--skeleton-track)_0_0/200%_100%_fixed] dark:[--skeleton-highlight:--alpha(var(--color-white)/4%)] dark:[--skeleton-track:color-mix(in_srgb,var(--foreground)_18%,var(--background))]",
        className,
      )}
      data-slot="skeleton"
      {...props}
    />
  );
}
