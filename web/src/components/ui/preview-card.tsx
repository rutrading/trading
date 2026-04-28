"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import type React from "react";
import { cn } from "@/lib/utils";

export const PreviewCard: typeof PreviewCardPrimitive.Root =
  PreviewCardPrimitive.Root;

export function PreviewCardTrigger({
  ...props
}: PreviewCardPrimitive.Trigger.Props): React.ReactElement {
  return (
    <PreviewCardPrimitive.Trigger data-slot="preview-card-trigger" {...props} />
  );
}

export function PreviewCardPopup({
  className,
  children,
  align = "center",
  sideOffset = 4,
  anchor,
  portalProps,
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  align?: PreviewCardPrimitive.Positioner.Props["align"];
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
  anchor?: PreviewCardPrimitive.Positioner.Props["anchor"];
  portalProps?: PreviewCardPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <PreviewCardPrimitive.Portal {...portalProps}>
      <PreviewCardPrimitive.Positioner
        align={align}
        anchor={anchor}
        className="z-50"
        data-slot="preview-card-positioner"
        sideOffset={sideOffset}
      >
        <PreviewCardPrimitive.Popup
          className={cn(
            "relative flex w-64 origin-(--transform-origin) flex-col gap-3 rounded-xl bg-popover p-4 text-popover-foreground text-sm",
            "shadow-[0_2px_8px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_2px_8px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.2),0_0_0_1px_rgb(255_255_255/0.06)]",
            "transition-[scale,opacity] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:duration-[140ms] data-ending-style:ease-[cubic-bezier(0.4,0,1,1)] data-starting-style:scale-[0.92] data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none",
            className,
          )}
          data-slot="preview-card-content"
          {...props}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export {
  PreviewCardPrimitive,
  PreviewCard as HoverCard,
  PreviewCardTrigger as HoverCardTrigger,
  PreviewCardPopup as HoverCardContent,
};
