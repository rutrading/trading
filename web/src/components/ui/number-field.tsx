"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { MinusIcon, PlusIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export const NumberFieldContext: React.Context<{
  fieldId: string;
} | null> = React.createContext<{
  fieldId: string;
} | null>(null);

export function NumberField({
  id,
  className,
  ...props
}: NumberFieldPrimitive.Root.Props): React.ReactElement {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;

  return (
    <NumberFieldContext.Provider value={{ fieldId }}>
      <NumberFieldPrimitive.Root
        className={cn("flex w-full flex-col items-start gap-1.5", className)}
        data-slot="number-field"
        id={fieldId}
        {...props}
      />
    </NumberFieldContext.Provider>
  );
}

export function NumberFieldRow({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn("flex w-full items-center gap-1.5", className)}
      data-slot="number-field-row"
      {...props}
    />
  );
}

const SECONDARY_SURFACE =
  "bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] not-dark:bg-clip-padding shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_32%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.55),0_-1px_0_rgb(0_0_0/0.06)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_22%,var(--background)),color-mix(in_srgb,var(--foreground)_6%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.14),0_-1px_0_rgb(0_0_0/0.2)]";

const FOCUS_HALO_GROUP =
  "focus-within:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] focus-within:inset-shadow-none has-aria-invalid:shadow-[0_0_0_1px_color-mix(in_srgb,var(--destructive)_55%,transparent),0_1px_2px_rgb(0_0_0/0.05)] focus-within:has-aria-invalid:shadow-[0_0_0_1px_var(--destructive),0_0_0_3px_color-mix(in_srgb,var(--destructive)_22%,transparent)]";

export function NumberFieldGroup({
  className,
  ...props
}: NumberFieldPrimitive.Group.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Group
      className={cn(
        "relative flex h-9 flex-1 overflow-hidden rounded-lg text-sm text-foreground transition-shadow data-disabled:pointer-events-none data-disabled:opacity-64",
        SECONDARY_SURFACE,
        FOCUS_HALO_GROUP,
        className,
      )}
      data-slot="number-field-group"
      {...props}
    />
  );
}

const STEPPER_BUTTON =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground active:scale-[0.97] focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)] focus-visible:outline-none data-disabled:pointer-events-none data-disabled:opacity-64 [&>svg]:size-4 [&>svg]:shrink-0";

export function NumberFieldDecrement({
  className,
  children,
  ...props
}: NumberFieldPrimitive.Decrement.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Decrement
      className={cn(STEPPER_BUTTON, className)}
      data-slot="number-field-decrement"
      {...props}
    >
      {children ?? <MinusIcon aria-hidden />}
    </NumberFieldPrimitive.Decrement>
  );
}

export function NumberFieldIncrement({
  className,
  children,
  ...props
}: NumberFieldPrimitive.Increment.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Increment
      className={cn(STEPPER_BUTTON, className)}
      data-slot="number-field-increment"
      {...props}
    >
      {children ?? <PlusIcon aria-hidden />}
    </NumberFieldPrimitive.Increment>
  );
}

export function NumberFieldInput({
  className,
  ...props
}: NumberFieldPrimitive.Input.Props): React.ReactElement {
  return (
    <NumberFieldPrimitive.Input
      className={cn(
        "h-full w-full min-w-0 grow bg-transparent px-2 text-center font-medium tabular-nums outline-none [transition:background-color_5000000s_ease-in-out_0s]",
        className,
      )}
      data-slot="number-field-input"
      {...props}
    />
  );
}

export function NumberFieldScrubArea({
  className,
  label,
  children,
  ...props
}: NumberFieldPrimitive.ScrubArea.Props & {
  label?: string;
}): React.ReactElement {
  const context = React.useContext(NumberFieldContext);

  if (!context) {
    throw new Error(
      "NumberFieldScrubArea must be used within a NumberField for accessibility.",
    );
  }

  return (
    <NumberFieldPrimitive.ScrubArea
      className={cn(
        "inline-flex cursor-ew-resize items-center gap-1 text-xs leading-none text-muted-foreground select-none",
        className,
      )}
      data-slot="number-field-scrub-area"
      {...props}
    >
      {label ? (
        <Label className="cursor-ew-resize text-xs" htmlFor={context.fieldId}>
          {label}
        </Label>
      ) : null}
      {children}
      <NumberFieldPrimitive.ScrubAreaCursor className="z-50 drop-shadow-[0_1px_1px_#0008]">
        <CursorGrowIcon />
      </NumberFieldPrimitive.ScrubAreaCursor>
    </NumberFieldPrimitive.ScrubArea>
  );
}

export function CursorGrowIcon(
  props: React.ComponentProps<"svg">,
): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="black"
      height="14"
      stroke="white"
      viewBox="0 0 24 14"
      width="26"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19.5 5.5L6.49737 5.51844V2L1 6.9999L6.5 12L6.49737 8.5L19.5 8.5V12L25 6.9999L19.5 2V5.5Z" />
    </svg>
  );
}

export { NumberFieldPrimitive };
