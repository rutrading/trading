import type * as React from "react";
import { cn } from "@/lib/utils";

export function Kbd({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded bg-background px-1 font-sans text-xs font-medium text-foreground [&_svg:not([class*='size-'])]:size-3",
        "shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background)),0_1px_0_color-mix(in_srgb,var(--foreground)_24%,var(--background))]",
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_14%,var(--background)),color-mix(in_srgb,var(--foreground)_4%,var(--background)))]",
        "dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_0_rgb(0_0_0/0.4)]",
        className,
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

export function KbdGroup({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}
