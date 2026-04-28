"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type React from "react";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props): React.ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-5 w-[34px] shrink-0 cursor-pointer items-center rounded-full outline-none transition-[background-color,box-shadow,transform] duration-[120ms] ease-out",
        // Off — flat gray track, no ring, no bezel. Reads as "disabled-looking".
        "data-unchecked:bg-[color-mix(in_srgb,var(--foreground)_18%,var(--background))] dark:data-unchecked:bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))]",
        // On — brand primary fill with button-language ring + bezel. Dark mode uses the primary gradient for the top-lit / bottom-darker look.
        "data-checked:bg-primary data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_18%,transparent)] data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.28),0_-1px_0_rgb(0_0_0/0.08)]",
        "dark:data-checked:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.2)]",
        // Focus / press / disabled
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[.97] data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:active:scale-100",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-1/2 left-0.5 block h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-[transform,width,height] duration-[140ms] ease-out will-change-transform shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.2)]",
          "group-data-checked/switch:translate-x-[14px]",
          "group-hover/switch:not-group-data-disabled/switch:w-[18px] group-data-checked/switch:group-hover/switch:not-group-data-disabled/switch:translate-x-3",
          "group-active/switch:not-group-data-disabled/switch:h-3 group-active/switch:not-group-data-disabled/switch:w-5 group-data-checked/switch:group-active/switch:not-group-data-disabled/switch:translate-x-[11px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { SwitchPrimitive };
