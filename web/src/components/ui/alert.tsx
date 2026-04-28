import type * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";

// Alerts share the button-language surface: box-shadow ring + inset bezel +
// dark-mode gradient. Each semantic variant tints the fill / ring / icon in
// its own accent color. No CSS border.
const alertVariants = tv({
  base: "relative grid w-full items-start gap-x-2 gap-y-0.5 rounded-xl px-3.5 py-3 text-card-foreground text-sm not-dark:bg-clip-padding has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*4)_1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-data-[slot=alert-action]:grid-cols-[1fr_auto] has-[>svg]:gap-x-2 [&>svg]:h-lh [&>svg]:w-4",
  defaultVariants: {
    variant: "default",
  },
  variants: {
    variant: {
      default:
        "bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_10%,var(--background)),color-mix(in_srgb,var(--foreground)_3%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.45),0_1px_2px_rgb(0_0_0/0.25)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)] [&>svg]:text-muted-foreground",
      error:
        "bg-[color-mix(in_srgb,var(--destructive)_6%,var(--background))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_32%,var(--background)),0_1px_2px_color-mix(in_srgb,var(--destructive)_10%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--destructive)_16%,var(--background)),color-mix(in_srgb,var(--destructive)_8%,var(--background)))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_40%,black),0_1px_2px_rgb(0_0_0/0.25)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)] [&>svg]:text-destructive",
      info: "bg-[color-mix(in_srgb,var(--info)_6%,var(--background))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--info)_32%,var(--background)),0_1px_2px_color-mix(in_srgb,var(--info)_10%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--info)_16%,var(--background)),color-mix(in_srgb,var(--info)_8%,var(--background)))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--info)_40%,black),0_1px_2px_rgb(0_0_0/0.25)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)] [&>svg]:text-info",
      success:
        "bg-[color-mix(in_srgb,var(--success)_6%,var(--background))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_32%,var(--background)),0_1px_2px_color-mix(in_srgb,var(--success)_10%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--success)_16%,var(--background)),color-mix(in_srgb,var(--success)_8%,var(--background)))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_40%,black),0_1px_2px_rgb(0_0_0/0.25)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)] [&>svg]:text-success",
      warning:
        "bg-[color-mix(in_srgb,var(--warning)_6%,var(--background))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--warning)_32%,var(--background)),0_1px_2px_color-mix(in_srgb,var(--warning)_10%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--warning)_16%,var(--background)),color-mix(in_srgb,var(--warning)_8%,var(--background)))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--warning)_40%,black),0_1px_2px_rgb(0_0_0/0.25)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)] [&>svg]:text-warning",
    },
  },
});

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants>): React.ReactElement {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("font-medium [svg~&]:col-start-2", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 text-muted-foreground [svg~&]:col-start-2",
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  );
}

export function AlertAction({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex gap-1 max-sm:col-start-2 max-sm:mt-2 sm:row-start-1 sm:row-end-3 sm:self-center sm:[[data-slot=alert-description]~&]:col-start-2 sm:[[data-slot=alert-title]~&]:col-start-2 sm:[svg~&]:col-start-2 sm:[svg~[data-slot=alert-description]~&]:col-start-3 sm:[svg~[data-slot=alert-title]~&]:col-start-3",
        className,
      )}
      data-slot="alert-action"
      {...props}
    />
  );
}
