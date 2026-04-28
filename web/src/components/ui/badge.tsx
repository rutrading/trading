"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type React from "react";
import { cn } from "@/lib/utils";

const BADGE_BASE =
  "inline-flex items-center gap-x-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-[120ms] ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='opacity-'])]:opacity-90 [&_svg]:pointer-events-none [&_svg]:shrink-0 [button&,a&]:cursor-pointer";

// Solid variants: gradient fill + 1px shadow ring + inset top highlight.
// Mirrors Button design language. Light text on most tones; dark text on
// yellow-family tones for legibility.
const SOLID: Record<BadgeVariant, string> = {
  default:
    "text-foreground bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_14%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_28%,var(--background)),0_1px_2px_rgb(0_0_0/0.08)] inset-shadow-[0_1px_0_rgb(255_255_255/0.45),0_-1px_0_rgb(0_0_0/0.05)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_8%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.3)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.18)]",
  info: "text-white bg-[linear-gradient(180deg,var(--color-sky-500),var(--color-sky-600))] shadow-[0_0_0_1px_var(--color-sky-700),0_1px_2px_color-mix(in_srgb,var(--color-sky-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  success:
    "text-white bg-[linear-gradient(180deg,var(--color-emerald-500),var(--color-emerald-600))] shadow-[0_0_0_1px_var(--color-emerald-700),0_1px_2px_color-mix(in_srgb,var(--color-emerald-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  warning:
    "text-amber-950 bg-[linear-gradient(180deg,var(--color-amber-400),var(--color-amber-500))] shadow-[0_0_0_1px_var(--color-amber-600),0_1px_2px_color-mix(in_srgb,var(--color-amber-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.45),0_-1px_0_rgb(0_0_0/0.1)]",
  destructive:
    "text-white bg-[linear-gradient(180deg,var(--color-rose-500),var(--color-rose-600))] shadow-[0_0_0_1px_var(--color-rose-700),0_1px_2px_color-mix(in_srgb,var(--color-rose-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  zinc: "text-white bg-[linear-gradient(180deg,var(--color-zinc-500),var(--color-zinc-700))] shadow-[0_0_0_1px_var(--color-zinc-800),0_1px_2px_rgb(0_0_0/0.18)] inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.18)]",
  red: "text-white bg-[linear-gradient(180deg,var(--color-red-500),var(--color-red-600))] shadow-[0_0_0_1px_var(--color-red-700),0_1px_2px_color-mix(in_srgb,var(--color-red-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  orange:
    "text-white bg-[linear-gradient(180deg,var(--color-orange-500),var(--color-orange-600))] shadow-[0_0_0_1px_var(--color-orange-700),0_1px_2px_color-mix(in_srgb,var(--color-orange-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  amber:
    "text-amber-950 bg-[linear-gradient(180deg,var(--color-amber-400),var(--color-amber-500))] shadow-[0_0_0_1px_var(--color-amber-600),0_1px_2px_color-mix(in_srgb,var(--color-amber-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.45),0_-1px_0_rgb(0_0_0/0.1)]",
  yellow:
    "text-yellow-950 bg-[linear-gradient(180deg,var(--color-yellow-300),var(--color-yellow-400))] shadow-[0_0_0_1px_var(--color-yellow-600),0_1px_2px_color-mix(in_srgb,var(--color-yellow-400)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.5),0_-1px_0_rgb(0_0_0/0.1)]",
  lime: "text-lime-950 bg-[linear-gradient(180deg,var(--color-lime-300),var(--color-lime-400))] shadow-[0_0_0_1px_var(--color-lime-600),0_1px_2px_color-mix(in_srgb,var(--color-lime-400)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.5),0_-1px_0_rgb(0_0_0/0.1)]",
  green:
    "text-white bg-[linear-gradient(180deg,var(--color-green-500),var(--color-green-600))] shadow-[0_0_0_1px_var(--color-green-700),0_1px_2px_color-mix(in_srgb,var(--color-green-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  emerald:
    "text-white bg-[linear-gradient(180deg,var(--color-emerald-500),var(--color-emerald-600))] shadow-[0_0_0_1px_var(--color-emerald-700),0_1px_2px_color-mix(in_srgb,var(--color-emerald-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  teal: "text-white bg-[linear-gradient(180deg,var(--color-teal-500),var(--color-teal-600))] shadow-[0_0_0_1px_var(--color-teal-700),0_1px_2px_color-mix(in_srgb,var(--color-teal-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  cyan: "text-white bg-[linear-gradient(180deg,var(--color-cyan-500),var(--color-cyan-600))] shadow-[0_0_0_1px_var(--color-cyan-700),0_1px_2px_color-mix(in_srgb,var(--color-cyan-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  sky: "text-white bg-[linear-gradient(180deg,var(--color-sky-500),var(--color-sky-600))] shadow-[0_0_0_1px_var(--color-sky-700),0_1px_2px_color-mix(in_srgb,var(--color-sky-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  blue: "text-white bg-[linear-gradient(180deg,var(--color-blue-500),var(--color-blue-600))] shadow-[0_0_0_1px_var(--color-blue-700),0_1px_2px_color-mix(in_srgb,var(--color-blue-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  indigo:
    "text-white bg-[linear-gradient(180deg,var(--color-indigo-500),var(--color-indigo-600))] shadow-[0_0_0_1px_var(--color-indigo-700),0_1px_2px_color-mix(in_srgb,var(--color-indigo-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  violet:
    "text-white bg-[linear-gradient(180deg,var(--color-violet-500),var(--color-violet-600))] shadow-[0_0_0_1px_var(--color-violet-700),0_1px_2px_color-mix(in_srgb,var(--color-violet-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  purple:
    "text-white bg-[linear-gradient(180deg,var(--color-purple-500),var(--color-purple-600))] shadow-[0_0_0_1px_var(--color-purple-700),0_1px_2px_color-mix(in_srgb,var(--color-purple-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  fuchsia:
    "text-white bg-[linear-gradient(180deg,var(--color-fuchsia-500),var(--color-fuchsia-600))] shadow-[0_0_0_1px_var(--color-fuchsia-700),0_1px_2px_color-mix(in_srgb,var(--color-fuchsia-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  pink: "text-white bg-[linear-gradient(180deg,var(--color-pink-500),var(--color-pink-600))] shadow-[0_0_0_1px_var(--color-pink-700),0_1px_2px_color-mix(in_srgb,var(--color-pink-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
  rose: "text-white bg-[linear-gradient(180deg,var(--color-rose-500),var(--color-rose-600))] shadow-[0_0_0_1px_var(--color-rose-700),0_1px_2px_color-mix(in_srgb,var(--color-rose-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.15)]",
};

// Soft variants: tinted fill, colored text, 1px colored ring, subtle inset
// highlight. Paired with SOLID as a secondary emphasis level.
const SOFT: Record<BadgeVariant, string> = {
  default:
    "text-foreground bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background))] inset-shadow-[0_1px_0_rgb(255_255_255/0.35)] dark:bg-white/5 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.06)]",
  info: "text-sky-800 dark:text-sky-300 bg-sky-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-sky-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  success:
    "text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-emerald-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  warning:
    "text-amber-900 dark:text-amber-300 bg-amber-500/12 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-amber-500)_32%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  destructive:
    "text-rose-800 dark:text-rose-300 bg-rose-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-rose-500)_32%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  zinc: "text-zinc-800 dark:text-zinc-300 bg-zinc-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-zinc-500)_28%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  red: "text-red-800 dark:text-red-300 bg-red-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-red-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  orange:
    "text-orange-800 dark:text-orange-300 bg-orange-500/12 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-orange-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  amber:
    "text-amber-900 dark:text-amber-300 bg-amber-500/12 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-amber-500)_32%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  yellow:
    "text-yellow-900 dark:text-yellow-300 bg-yellow-400/20 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-yellow-500)_32%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  lime: "text-lime-900 dark:text-lime-300 bg-lime-400/18 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-lime-500)_32%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  green:
    "text-green-800 dark:text-green-300 bg-green-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-green-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  emerald:
    "text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-emerald-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  teal: "text-teal-800 dark:text-teal-300 bg-teal-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-teal-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  cyan: "text-cyan-800 dark:text-cyan-300 bg-cyan-500/12 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-cyan-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  sky: "text-sky-800 dark:text-sky-300 bg-sky-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-sky-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  blue: "text-blue-800 dark:text-blue-300 bg-blue-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-blue-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  indigo:
    "text-indigo-800 dark:text-indigo-300 bg-indigo-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-indigo-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  violet:
    "text-violet-800 dark:text-violet-300 bg-violet-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-violet-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  purple:
    "text-purple-800 dark:text-purple-300 bg-purple-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-purple-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  fuchsia:
    "text-fuchsia-800 dark:text-fuchsia-300 bg-fuchsia-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-fuchsia-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  pink: "text-pink-800 dark:text-pink-300 bg-pink-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-pink-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
  rose: "text-rose-800 dark:text-rose-300 bg-rose-500/10 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-rose-500)_30%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.4)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
};

export type BadgeVariant =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "destructive"
  | "zinc"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose";

export type BadgeAppearance = "solid" | "soft";

export interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: BadgeVariant;
  appearance?: BadgeAppearance;
}

export function Badge({
  className,
  variant = "default",
  appearance = "solid",
  render,
  ...props
}: BadgeProps): React.ReactElement {
  const surface = appearance === "soft" ? SOFT[variant] : SOLID[variant];
  const defaultProps = {
    className: cn(BADGE_BASE, surface, className),
    "data-slot": "badge",
    "data-appearance": appearance,
    "data-variant": variant,
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
}
