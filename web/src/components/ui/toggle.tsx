"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";

const PRESSED_DEPRESSION =
  "data-pressed:shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] dark:data-pressed:shadow-[inset_0_1px_2px_rgb(0_0_0/0.4)]";

export const toggleVariants = tv({
  base: cn(
    "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md outline-none font-medium",
    "transition-[box-shadow,background-color,color,transform] duration-[120ms] ease-out",
    "active:not-disabled:scale-[.96] data-pressed:not-disabled:scale-100",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-64",
    "pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11",
    "[&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
  ),
  defaultVariants: {
    size: "default",
    variant: "ghost",
  },
  variants: {
    size: {
      default: "h-9 min-w-9 px-[calc(--spacing(2)-1px)] text-base sm:h-8 sm:min-w-8 sm:text-sm",
      lg: "h-10 min-w-10 px-[calc(--spacing(2.5)-1px)] text-base sm:h-9 sm:min-w-9 sm:text-sm",
      sm: "h-8 min-w-8 px-[calc(--spacing(1.5)-1px)] text-sm sm:h-7 sm:min-w-7 sm:text-xs",
    },
    variant: {
      ghost: cn(
        "bg-transparent text-foreground hover:bg-accent",
        "data-pressed:bg-foreground/8 data-pressed:text-foreground dark:data-pressed:bg-foreground/14",
        PRESSED_DEPRESSION,
      ),
      secondary: cn(
        "text-foreground bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.55),0_-1px_0_rgb(0_0_0/0.06)]",
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.2)]",
        "hover:brightness-105",
        "data-pressed:inset-shadow-none",
        PRESSED_DEPRESSION,
      ),
      default: cn(
        "bg-primary text-primary-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_18%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28),0_-1px_0_rgb(0_0_0/0.08)]",
        "dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.2)]",
        "hover:brightness-105",
        "data-pressed:brightness-90 data-pressed:inset-shadow-none",
        PRESSED_DEPRESSION,
      ),
    },
  },
});

export type ToggleVariant = NonNullable<VariantProps<typeof toggleVariants>["variant"]>;
export type ToggleSize = NonNullable<VariantProps<typeof toggleVariants>["size"]>;

export function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants>): React.ReactElement {
  const base = toggleVariants({ size, variant });
  return (
    <TogglePrimitive
      className={
        typeof className === "function"
          ? (state) => cn(base, className(state))
          : cn(base, className)
      }
      data-slot="toggle"
      {...props}
    />
  );
}

export const ToggleGroupContext: React.Context<
  VariantProps<typeof toggleVariants>
> = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "ghost",
});

export function ToggleGroup({
  className,
  variant = "ghost",
  size = "default",
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants>): React.ReactElement {
  return (
    <ToggleGroupPrimitive
      className={cn(
        "flex w-fit gap-1 *:focus-visible:z-10",
        orientation === "vertical" && "flex-col",
        className,
      )}
      data-size={size}
      data-slot="toggle-group"
      data-variant={variant}
      orientation={orientation}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props &
  VariantProps<typeof toggleVariants>): React.ReactElement {
  const context = React.useContext(ToggleGroupContext);
  const resolvedVariant = variant ?? context.variant;
  const resolvedSize = size ?? context.size;

  return (
    <Toggle
      className={className}
      data-size={resolvedSize}
      data-variant={resolvedVariant}
      size={resolvedSize}
      variant={resolvedVariant}
      {...props}
    >
      {children}
    </Toggle>
  );
}

export { TogglePrimitive, ToggleGroupPrimitive };
