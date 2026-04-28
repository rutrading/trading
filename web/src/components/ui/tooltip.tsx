"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type React from "react";
import { cn } from "@/lib/utils";

export const TooltipCreateHandle: typeof TooltipPrimitive.createHandle =
  TooltipPrimitive.createHandle;

export const TooltipProvider: typeof TooltipPrimitive.Provider =
  TooltipPrimitive.Provider;

export const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

export function TooltipTrigger({
  delay = 300,
  ...props
}: TooltipPrimitive.Trigger.Props): React.ReactElement {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      delay={delay}
      {...props}
    />
  );
}

export type TooltipAppearance = "default" | "inverse";

// Side-aware slide entry + scale + opacity. CSS-only via base-ui's
// data-side / data-starting-style. Applied to every appearance.
const POPUP_ANIM =
  "origin-(--transform-origin) transition-[transform,opacity,scale] duration-[170ms] ease-out data-ending-style:duration-[110ms] data-instant:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-starting-style:scale-97 data-ending-style:scale-97 data-[side=top]:data-starting-style:translate-y-1 data-[side=bottom]:data-starting-style:-translate-y-1 data-[side=left]:data-starting-style:translate-x-1 data-[side=right]:data-starting-style:-translate-x-1 data-[side=top]:data-ending-style:translate-y-1 data-[side=bottom]:data-ending-style:-translate-y-1 data-[side=left]:data-ending-style:translate-x-1 data-[side=right]:data-ending-style:-translate-x-1";

// Default — theme-matched popover surface. Tooltip DNA (shadow ring + inset
// highlight) painted with the current theme's popover colors, so the
// tooltip feels like a native part of the page.
const POPUP_DEFAULT =
  "rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-[0_4px_12px_rgb(0_0_0/0.12),0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background))] inset-shadow-[0_1px_0_rgb(255_255_255/0.45)] dark:shadow-[0_4px_12px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.5)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]";

// Inverse — opt-in high-contrast surface. Dark bubble in light mode, light
// bubble in dark mode. Reach for this when the default doesn't pop enough
// against a busy background (images, charts, colored surfaces).
const POPUP_INVERSE =
  "rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-[0_4px_12px_rgb(0_0_0/0.15),0_0_0_1px_color-mix(in_srgb,var(--foreground)_40%,transparent)]";

export function TooltipPopup({
  className,
  appearance = "default",
  align = "center",
  sideOffset = 6,
  side = "top",
  anchor,
  children,
  portalProps,
  ...props
}: TooltipPrimitive.Popup.Props & {
  appearance?: TooltipAppearance;
  align?: TooltipPrimitive.Positioner.Props["align"];
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
  anchor?: TooltipPrimitive.Positioner.Props["anchor"];
  portalProps?: TooltipPrimitive.Portal.Props;
}): React.ReactElement {
  const surface = appearance === "inverse" ? POPUP_INVERSE : POPUP_DEFAULT;
  return (
    <TooltipPrimitive.Portal {...portalProps}>
      <TooltipPrimitive.Positioner
        align={align}
        anchor={anchor}
        className="z-50 transition-[top,left,right,bottom,transform] data-instant:transition-none"
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(surface, POPUP_ANIM, className)}
          data-slot="tooltip-popup"
          data-appearance={appearance}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

// Kbd chip tuned to whichever surface it sits on — light styling for the
// default (theme) surface, inverse-aware styling picked up via
// `data-appearance=inverse` on an ancestor popup.
export function TooltipKbd({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.ReactElement {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded border border-border bg-muted/60 px-1 py-px text-[10px] font-medium text-muted-foreground",
        "in-data-[appearance=inverse]:border-background/20 in-data-[appearance=inverse]:bg-background/15 in-data-[appearance=inverse]:text-background/80",
        className,
      )}
      data-slot="tooltip-kbd"
      {...props}
    />
  );
}

export { TooltipPrimitive, TooltipPopup as TooltipContent };
