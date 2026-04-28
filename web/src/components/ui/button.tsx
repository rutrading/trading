"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { Spinner } from "@/components/ui/spinner";

// Shadow stack, inspired by Figma-style button spec:
//   0 2px 4px rgba(0,0,0,.10)   ambient drop
//   0 0 0 1px <ring>            crisp 1px ring (replaces CSS border)
//   inset 0 1px 0 rgba(255,255,255,X)   subtle top highlight

export const buttonVariants = tv({
  base: "group/button relative inline-grid shrink-0 cursor-pointer place-items-center whitespace-nowrap rounded-lg border border-transparent font-medium text-base outline-none transition-[box-shadow,transform,background-color,border-color,color,filter] duration-[120ms] ease-out pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background active:not-disabled:scale-[.97] data-pressed:not-disabled:scale-[.97] disabled:pointer-events-none disabled:opacity-64 data-loading:select-none sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
  defaultVariants: {
    size: "default",
    variant: "default",
  },
  variants: {
      size: {
        default: "h-9 px-[calc(--spacing(3)-1px)] sm:h-8",
        icon: "size-9 sm:size-8",
        "icon-lg": "size-10 sm:size-9",
        "icon-sm": "size-8 sm:size-7",
        "icon-xl":
          "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        "icon-xs":
          "size-7 rounded-md sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
        sm: "h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-7",
        xl: "h-11 px-[calc(--spacing(4)-1px)] text-lg sm:h-10 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 rounded-md px-[calc(--spacing(2)-1px)] text-sm sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_18%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28),0_-1px_0_rgb(0_0_0/0.08)] hover:bg-[linear-gradient(90deg,var(--primary),color-mix(in_srgb,var(--primary)_68%,white))] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_36%,black),0_2px_4px_color-mix(in_srgb,var(--primary)_24%,transparent)] hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.38),0_-1px_0_rgb(0_0_0/0.08)] data-pressed:brightness-95 disabled:shadow-none disabled:inset-shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.2)] dark:hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--primary)_90%,black),var(--primary))] dark:hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_48%,black),0_2px_4px_color-mix(in_srgb,var(--primary)_38%,transparent)] dark:hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.22)] *:data-[slot=button-loading-indicator]:text-primary-foreground",
        secondary:
          "bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_2px_4px_rgb(0_0_0/0.1)] inset-shadow-[0_1px_0_rgb(255_255_255/0.55),0_-1px_0_rgb(0_0_0/0.06)] hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--foreground)_7%,var(--background)),color-mix(in_srgb,var(--foreground)_18%,var(--background)))] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_40%,var(--background)),0_2px_4px_rgb(0_0_0/0.18)] hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.8),0_-1px_0_rgb(0_0_0/0.08)] data-pressed:bg-[color-mix(in_srgb,var(--foreground)_14%,var(--background))] disabled:shadow-none disabled:inset-shadow-none dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_2px_6px_rgb(0_0_0/0.35)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.2)] dark:hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--foreground)_14%,var(--background)),color-mix(in_srgb,var(--foreground)_26%,var(--background)))] dark:hover:shadow-[0_0_0_1px_rgb(0_0_0/0.65),0_2px_6px_rgb(0_0_0/0.5)] dark:hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.24),0_-1px_0_rgb(0_0_0/0.24)] dark:data-pressed:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_26%,var(--background)),color-mix(in_srgb,var(--foreground)_18%,var(--background)))] *:data-[slot=button-loading-indicator]:text-foreground",
        outline:
          "bg-background text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_24%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.04)] hover:bg-[linear-gradient(90deg,var(--background),color-mix(in_srgb,var(--foreground)_10%,var(--background)))] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_1px_2px_rgb(0_0_0/0.08)] hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.5),0_-1px_0_rgb(0_0_0/0.04)] data-pressed:bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] disabled:shadow-none disabled:inset-shadow-none dark:bg-transparent dark:shadow-[0_0_0_1px_rgb(0_0_0/0.36),0_1px_2px_rgb(0_0_0/0.18)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08),0_-1px_0_rgb(0_0_0/0.12)] dark:hover:bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--foreground)_12%,var(--background)))] dark:hover:shadow-[0_0_0_1px_rgb(0_0_0/0.46),0_1px_2px_rgb(0_0_0/0.3)] dark:hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.16)] dark:data-pressed:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))] *:data-[slot=button-loading-indicator]:text-foreground",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground data-pressed:bg-accent/80 data-pressed:text-foreground *:data-[slot=button-loading-indicator]:text-foreground",
        link: "bg-transparent text-muted-foreground underline underline-offset-[5px] decoration-[1.5px] decoration-transparent hover:text-foreground hover:decoration-foreground data-pressed:text-foreground data-pressed:decoration-foreground transition-[color,text-decoration-color] duration-[180ms] ease-out *:data-[slot=button-loading-indicator]:text-foreground",
        destructive:
          "bg-destructive text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_58%,black),0_2px_4px_color-mix(in_srgb,var(--destructive)_28%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.18)] hover:bg-[linear-gradient(90deg,var(--destructive),color-mix(in_srgb,var(--destructive)_78%,black))] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_70%,black),0_2px_4px_color-mix(in_srgb,var(--destructive)_42%,transparent)] hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.22)] data-pressed:brightness-95 disabled:shadow-none disabled:inset-shadow-none dark:bg-[linear-gradient(180deg,var(--destructive),color-mix(in_srgb,var(--destructive)_72%,black))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_2px_6px_rgb(0_0_0/0.35)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.24)] dark:hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--destructive)_88%,black),color-mix(in_srgb,var(--destructive)_90%,white))] dark:hover:shadow-[0_0_0_1px_rgb(0_0_0/0.65),0_2px_6px_rgb(0_0_0/0.5)] dark:hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.3)] *:data-[slot=button-loading-indicator]:text-white",
        success:
          "bg-success text-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_58%,black),0_2px_4px_color-mix(in_srgb,var(--success)_28%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.18)] hover:bg-[linear-gradient(90deg,var(--success),color-mix(in_srgb,var(--success)_78%,black))] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--success)_70%,black),0_2px_4px_color-mix(in_srgb,var(--success)_42%,transparent)] hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.22)] data-pressed:brightness-95 disabled:shadow-none disabled:inset-shadow-none dark:bg-[linear-gradient(180deg,var(--success),color-mix(in_srgb,var(--success)_72%,black))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_2px_6px_rgb(0_0_0/0.35)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.24)] dark:hover:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--success)_88%,black),color-mix(in_srgb,var(--success)_90%,white))] dark:hover:shadow-[0_0_0_1px_rgb(0_0_0/0.65),0_2px_6px_rgb(0_0_0/0.5)] dark:hover:inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.3)] *:data-[slot=button-loading-indicator]:text-white",
    },
  },
});

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  render,
  children,
  loading = false,
  disabled: disabledProp,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled: boolean = Boolean(loading || disabledProp);
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    children: (
      <>
        <span
          className="col-start-1 row-start-1 flex items-center justify-center gap-2 group-data-loading/button:invisible"
          data-slot="button-content"
        >
          {children}
        </span>
        <Spinner
          className="col-start-1 row-start-1 invisible pointer-events-none group-data-loading/button:visible"
          data-slot="button-loading-indicator"
        />
      </>
    ),
    className: buttonVariants({ class: className, size, variant }),
    "aria-disabled": loading || undefined,
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}
