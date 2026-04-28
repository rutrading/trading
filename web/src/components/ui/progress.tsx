"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import type React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  className,
  children,
  variant = "default",
  ...props
}: ProgressPrimitive.Root.Props & {
  variant?: ProgressVariant;
}): React.ReactElement {
  return (
    <ProgressPrimitive.Root
      className={cn("flex w-full flex-col gap-2", className)}
      data-slot="progress"
      {...props}
    >
      {children ? (
        children
      ) : (
        <ProgressTrack>
          <ProgressIndicator variant={variant} />
        </ProgressTrack>
      )}
    </ProgressPrimitive.Root>
  );
}

export function ProgressLabel({
  className,
  ...props
}: ProgressPrimitive.Label.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Label
      className={cn("font-medium text-sm", className)}
      data-slot="progress-label"
      {...props}
    />
  );
}

export function ProgressTrack({
  className,
  ...props
}: ProgressPrimitive.Track.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "block h-[18px] w-full overflow-hidden rounded-full",
        "bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background)),inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-1px_0_rgb(0_0_0/0.06)]",
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.14),inset_0_-1px_0_rgb(0_0_0/0.2)]",
        className,
      )}
      data-slot="progress-track"
      {...props}
    />
  );
}

export type ProgressVariant = "default" | "striped";

export function ProgressIndicator({
  className,
  variant = "default",
  ...props
}: ProgressPrimitive.Indicator.Props & {
  variant?: ProgressVariant;
}): React.ReactElement {
  return (
    <ProgressPrimitive.Indicator
      className={cn(
        "relative overflow-hidden bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_86%,white),var(--primary))] transition-all duration-500 dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))]",
        variant === "striped" &&
          "after:pointer-events-none after:absolute after:inset-0 after:animate-progress-stripe after:bg-[length:16px_16px] after:opacity-30 after:[background-image:linear-gradient(45deg,rgba(255,255,255,.5)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.5)_50%,rgba(255,255,255,.5)_75%,transparent_75%,transparent)]",
        className,
      )}
      data-slot="progress-indicator"
      {...props}
    />
  );
}

export function ProgressValue({
  className,
  ...props
}: ProgressPrimitive.Value.Props): React.ReactElement {
  return (
    <ProgressPrimitive.Value
      className={cn("text-sm tabular-nums", className)}
      data-slot="progress-value"
      {...props}
    />
  );
}

export { ProgressPrimitive };
