"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckboxGroup as CheckboxGroupPrimitive } from "@base-ui/react/checkbox-group";
import type React from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props): React.ReactElement {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        // Base
        "group/checkbox relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-[.25rem] outline-none not-dark:bg-clip-padding transition-[background-color,box-shadow,transform] duration-[120ms] ease-out active:not-data-disabled:scale-[.92] data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4",
        // Unchecked fill + ring + bezel (light)
        "bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_44%,var(--background)),0_1px_2px_rgb(0_0_0/0.06)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3)]",
        // Unchecked (dark) — gradient for the bottom thing
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_14%,var(--background)),color-mix(in_srgb,var(--foreground)_4%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
        // Checked / indeterminate — primary fill + primary-dark ring + bezel (matches default Button)
        "data-checked:bg-primary data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_20%,transparent)] data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.1)]",
        "data-indeterminate:bg-primary data-indeterminate:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_20%,transparent)] data-indeterminate:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.1)]",
        // Checked / indeterminate (dark) — primary gradient
        "dark:data-checked:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:data-checked:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:data-checked:inset-shadow-[0_1px_0_rgb(255_255_255/0.24),0_-1px_0_rgb(0_0_0/0.2)]",
        "dark:data-indeterminate:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:data-indeterminate:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:data-indeterminate:inset-shadow-[0_1px_0_rgb(255_255_255/0.24),0_-1px_0_rgb(0_0_0/0.2)]",
        // Focus
        "focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] focus-visible:inset-shadow-none dark:focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)]",
        // Invalid
        "aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent),0_1px_2px_rgb(0_0_0/0.05)] focus-visible:aria-invalid:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_22%,transparent)] dark:aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_60%,transparent),0_1px_2px_rgb(0_0_0/0.2)]",
        className,
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary-foreground transition-[opacity,transform] duration-[140ms] ease-out opacity-0 scale-75 group-data-checked/checkbox:opacity-100 group-data-checked/checkbox:scale-100 group-data-indeterminate/checkbox:opacity-100 group-data-indeterminate/checkbox:scale-100"
        data-slot="checkbox-indicator"
        render={(
          props: React.ComponentProps<"span">,
          state: CheckboxPrimitive.Indicator.State,
        ) => (
          <span {...props}>
            {state.indeterminate ? (
              <svg
                aria-hidden="true"
                className="size-3.5 sm:size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12h13.496" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                className="size-3.5 sm:size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
              </svg>
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export function CheckboxGroup({
  className,
  ...props
}: CheckboxGroupPrimitive.Props): React.ReactElement {
  return (
    <CheckboxGroupPrimitive
      className={cn("flex flex-col items-start gap-3", className)}
      {...props}
    />
  );
}

export { CheckboxPrimitive, CheckboxGroupPrimitive };
