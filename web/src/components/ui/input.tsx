"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";

/**
 * Shared surface for any input-shaped control: plain `Input`, `InputGroup`,
 * `InsetField`-style custom wrappers, overlapping-label fieldsets, etc.
 * Shadow-based "border" + inset top highlight + dark-mode gradient fill,
 * with focus / aria-invalid / disabled driven by `has-[input...]` selectors
 * so the wrapper reacts to whatever control sits inside.
 *
 * `layout` controls the root display:
 *  - `inline` → `inline-flex w-full` for a single-row control
 *  - `block`  → `block w-full` for stacked layouts like inset labels
 */
/**
 * Shared surface for all secondary-family controls: `Input`,
 * `InputGroup`, `Textarea`, `Select` trigger, `Combobox` wrapper, and
 * any custom input-shaped layout. Color palette mirrors the
 * `secondary` Button variant so every secondary-emphasis surface reads
 * as one family.
 *
 * Both selector forms are included so the variant works for:
 *  - Input wrappers (`<span>` containing `<input>`) — via
 *    `has-[input:focus-visible,textarea:focus-visible]:` etc.
 *  - Button triggers (`<button>` that IS the control, e.g.
 *    `SelectTrigger`) — via `focus-visible:` / `aria-invalid:` /
 *    `data-pressed:` / `data-disabled:` directly on self.
 */
export const inputSurfaceVariants = tv({
  base: "relative rounded-lg bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding text-base text-foreground outline-none transition-shadow shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.55),0_-1px_0_rgb(0_0_0/0.06)] has-[input:focus-visible,textarea:focus-visible]:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] has-[input:focus-visible,textarea:focus-visible]:inset-shadow-none focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] focus-visible:inset-shadow-none data-pressed:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] data-pressed:inset-shadow-none has-[input[aria-invalid],textarea[aria-invalid]]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent),0_1px_2px_rgb(0_0_0/0.05)] aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent),0_1px_2px_rgb(0_0_0/0.05)] has-[input:focus-visible,textarea:focus-visible]:has-[input[aria-invalid],textarea[aria-invalid]]:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_22%,transparent)] focus-visible:aria-invalid:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_22%,transparent)] has-autofill:bg-foreground/8 has-[input:disabled,textarea:disabled]:opacity-64 has-[input:disabled,textarea:disabled]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background))] has-[input:disabled,textarea:disabled]:inset-shadow-none disabled:opacity-64 data-disabled:opacity-64 data-disabled:pointer-events-none sm:text-sm dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.2)] dark:has-[input:focus-visible,textarea:focus-visible]:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)] dark:focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)] dark:data-pressed:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_28%,transparent)] dark:has-[input[aria-invalid],textarea[aria-invalid]]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_60%,transparent),0_1px_2px_rgb(0_0_0/0.2)] dark:aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_60%,transparent),0_1px_2px_rgb(0_0_0/0.2)] dark:has-[input:focus-visible,textarea:focus-visible]:has-[input[aria-invalid],textarea[aria-invalid]]:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_30%,transparent)] dark:focus-visible:aria-invalid:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_30%,transparent)] dark:has-autofill:bg-foreground/12",
  variants: {
    layout: {
      inline: "inline-flex w-full",
      block: "block w-full",
    },
  },
  defaultVariants: {
    layout: "inline",
  },
});

/**
 * Class string for the inner `<input>` / `InputPrimitive` element itself —
 * height, horizontal padding, placeholder color. Pair with
 * `inputSurfaceVariants` on the wrapper when composing a custom layout.
 */
export const inputInnerVariants = tv({
  base: "h-8.5 w-full min-w-0 rounded-[inherit] px-[calc(--spacing(3)-1px)] leading-8.5 outline-none [transition:background-color_5000000s_ease-in-out_0s] placeholder:text-muted-foreground/72 sm:h-7.5 sm:leading-7.5",
  variants: {
    size: {
      default: "",
      sm: "h-7.5 px-[calc(--spacing(2.5)-1px)] leading-7.5 sm:h-6.5 sm:leading-6.5",
      lg: "h-9.5 leading-9.5 sm:h-8.5 sm:leading-8.5",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  /**
   * Render a raw `<input>` instead of base-ui's `InputPrimitive`. Set this
   * when Input is passed via `render` to another base-ui primitive
   * (`Autocomplete.Input`, `Combobox.Input`, etc.) — those components wrap
   * the rendered element in their own input handling, and double-wrapping
   * with `InputPrimitive` produces a broken control.
   */
  nativeInput?: boolean;
};

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  ...props
}: InputProps): React.ReactElement {
  const sizeVariant = size === "sm" || size === "lg" ? size : "default";
  const inputClassName = cn(
    inputInnerVariants({ size: sizeVariant }),
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return (
    <span
      className={
        cn(!unstyled && inputSurfaceVariants({ layout: "inline" }), className) ||
        undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        (() => {
          const { style, ...rest } = props;
          return (
            <input
              className={inputClassName}
              data-slot="input"
              size={typeof size === "number" ? size : undefined}
              style={typeof style === "function" ? undefined : style}
              {...rest}
            />
          );
        })()
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          {...props}
        />
      )}
    </span>
  );
}

/**
 * Wrapper for layouts that mix the input with leading / trailing addons
 * (icons, prefix text, inline buttons, keyboard shortcuts, etc.). Shares
 * the exact surface styling with plain `Input` via `inputSurfaceVariants`,
 * then layers on align / textarea handling. Children use
 * `<Input unstyled />` / `<Textarea unstyled />` so the inner control
 * stays unstyled and the group owns the chrome.
 */
export function InputGroup({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        inputSurfaceVariants({ layout: "inline" }),
        "min-w-0 items-center has-[textarea]:h-auto has-data-[align=block-end]:h-auto has-data-[align=block-start]:h-auto has-data-[align=block-end]:flex-col has-data-[align=block-start]:flex-col *:[[data-slot=input-control],[data-slot=textarea-control]]:contents *:[[data-slot=input-control],[data-slot=textarea-control]]:before:hidden has-[[data-align=block-start],[data-align=block-end]]:**:[input]:h-auto has-data-[align=inline-start]:**:[input]:ps-2 has-data-[align=inline-end]:**:[input]:pe-2 has-data-[align=block-end]:**:[input]:pt-1.5 has-data-[align=block-start]:**:[input]:pb-1.5 has-data-[align=inline-start]:**:[[data-size=sm]_input]:ps-1.5 has-data-[align=inline-end]:**:[[data-size=sm]_input]:pe-1.5 **:[textarea]:min-h-20.5 **:[textarea]:resize-none **:[textarea]:py-[calc(--spacing(3)-1px)] **:[textarea]:max-sm:min-h-23.5 **:[textarea_button]:rounded-[calc(var(--radius-md)-1px)]",
        className,
      )}
      data-slot="input-group"
      role="group"
      {...props}
    />
  );
}

const inputGroupAddonVariants = tv({
  base: "flex h-auto cursor-text select-none items-center justify-center gap-2 leading-none [&>kbd]:rounded-[calc(var(--radius)-5px)] in-[[data-slot=input-group]:has([data-slot=input-control],[data-slot=textarea-control])]:[&_svg:not([class*='size-'])]:size-4.5 sm:in-[[data-slot=input-group]:has([data-slot=input-control],[data-slot=textarea-control])]:[&_svg:not([class*='size-'])]:size-4 [&_svg]:-mx-0.5 not-has-[button]:**:[svg:not([class*='opacity-'])]:opacity-80",
  defaultVariants: {
    align: "inline-start",
  },
  variants: {
    align: {
      "block-end":
        "order-last w-full justify-start px-[calc(--spacing(3)-1px)] pb-[calc(--spacing(3)-1px)] [.border-t]:pt-[calc(--spacing(3)-1px)] [[data-size=sm]+&]:px-[calc(--spacing(2.5)-1px)]",
      "block-start":
        "order-first w-full justify-start px-[calc(--spacing(3)-1px)] pt-[calc(--spacing(3)-1px)] [.border-b]:pb-[calc(--spacing(3)-1px)] [[data-size=sm]+&]:px-[calc(--spacing(2.5)-1px)]",
      "inline-end":
        "order-last pe-[calc(--spacing(3)-1px)] has-[>:last-child[data-slot=badge]]:-me-1.5 has-[>button]:-me-2 has-[>kbd:last-child]:me-[-0.35rem] [[data-size=sm]+&]:pe-[calc(--spacing(2.5)-1px)]",
      "inline-start":
        "order-first ps-[calc(--spacing(3)-1px)] has-[>:last-child[data-slot=badge]]:-ms-1.5 has-[>button]:-ms-2 has-[>kbd:last-child]:ms-[-0.35rem] [[data-size=sm]+&]:ps-[calc(--spacing(2.5)-1px)]",
    },
  },
});

/**
 * Positioned slot inside an `InputGroup`. Holds icons, buttons, kbd
 * chips, prefix/suffix text — whatever sits next to the control.
 * `align` picks which edge (`inline-start` / `inline-end` for left/right
 * gutters, `block-start` / `block-end` for rows above/below).
 */
export function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof inputGroupAddonVariants>): React.ReactElement {
  return (
    <div
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      {...props}
    />
  );
}

/**
 * Muted inline text inside an `InputGroupAddon`. Used for prefix/suffix
 * labels like "https://", "$", "USD", etc.
 */
export function InputGroupText({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      className={cn(
        "line-clamp-1 flex items-center gap-2 whitespace-nowrap text-muted-foreground leading-none in-[[data-slot=input-group]:has([data-slot=input-control],[data-slot=textarea-control])]:[&_svg:not([class*='size-'])]:size-4.5 sm:in-[[data-slot=input-group]:has([data-slot=input-control],[data-slot=textarea-control])]:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5",
        className,
      )}
      {...props}
    />
  );
}

export { InputPrimitive };
