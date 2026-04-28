"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type React from "react";
import { cn } from "@/lib/utils";

export function RadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props): React.ReactElement {
  return (
    <RadioGroupPrimitive
      className={cn("flex flex-col gap-3", className)}
      data-slot="radio-group"
      {...props}
    />
  );
}

export function Radio({
  className,
  ...props
}: RadioPrimitive.Root.Props): React.ReactElement {
  return (
    <RadioPrimitive.Root
      className={cn(
        // Base
        "group/radio relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-full outline-none not-dark:bg-clip-padding transition-[background-color,box-shadow,transform] duration-[120ms] ease-out active:not-data-disabled:scale-[.92] data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4",
        // Unchecked fill + ring + bezel (light)
        "bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_44%,var(--background)),0_1px_2px_rgb(0_0_0/0.06)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3)]",
        // Unchecked (dark) — gradient
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_14%,var(--background)),color-mix(in_srgb,var(--foreground)_4%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
        // Checked — primary fill + primary-dark ring + bezel (matches default Button)
        "data-checked:bg-primary data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_20%,transparent)] data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.1)]",
        // Checked (dark) — primary gradient
        "dark:data-checked:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.24),0_-1px_0_rgb(0_0_0/0.2)]",
        // Focus
        "focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] focus-visible:inset-shadow-none dark:focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)]",
        // Invalid
        "aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent),0_1px_2px_rgb(0_0_0/0.05)] focus-visible:aria-invalid:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_22%,transparent)] dark:aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_60%,transparent),0_1px_2px_rgb(0_0_0/0.2)]",
        className,
      )}
      data-slot="radio"
      {...props}
    >
      <RadioPrimitive.Indicator
        keepMounted
        className="pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[140ms] ease-out opacity-0 scale-50 group-data-checked/radio:opacity-100 group-data-checked/radio:scale-100"
        data-slot="radio-indicator"
      >
        <span className="block size-2 rounded-full bg-primary-foreground sm:size-1.5" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export { RadioGroupPrimitive, RadioPrimitive, Radio as RadioGroupItem };
