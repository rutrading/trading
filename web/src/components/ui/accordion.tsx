"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon, MinusIcon, PlusIcon } from "lucide-react";
import { createContext, useContext } from "react";
import type React from "react";
import { cn } from "@/lib/utils";

// Two variants. Both share the same 260ms cubic-bezier(.22,.61,.36,1)
// timing so icon motion matches the panel height animation exactly.
//   - default — chevron rotates 180° on open
//   - plus    — plus icon rotates + fades out while minus icon fades in
export type AccordionVariant = "default" | "plus";

const AccordionVariantContext = createContext<AccordionVariant>("default");

const ACCORDION_EASE =
  "duration-[260ms] [transition-timing-function:cubic-bezier(.22,.61,.36,1)]";

export function Accordion({
  variant = "default",
  ...props
}: AccordionPrimitive.Root.Props & {
  variant?: AccordionVariant;
}): React.ReactElement {
  return (
    <AccordionVariantContext.Provider value={variant}>
      <AccordionPrimitive.Root data-slot="accordion" {...props} />
    </AccordionVariantContext.Provider>
  );
}

export function AccordionItem({
  className,
  ...props
}: AccordionPrimitive.Item.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b last:border-b-0", className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

const ChevronIndicator = () => (
  <ChevronDownIcon
    className={cn(
      "pointer-events-none size-4 shrink-0 translate-y-0.5 opacity-80 transition-transform",
      ACCORDION_EASE,
    )}
    data-slot="accordion-indicator"
  />
);

const PlusMinusIndicator = () => (
  <span
    className="pointer-events-none relative grid size-4 shrink-0 translate-y-0.5 place-items-center"
    data-slot="accordion-indicator"
  >
    <PlusIcon
      className={cn(
        "absolute size-4 opacity-80 transition-[opacity,transform]",
        ACCORDION_EASE,
        "group-data-panel-open/accordion-trigger:rotate-90 group-data-panel-open/accordion-trigger:opacity-0",
      )}
    />
    <MinusIcon
      className={cn(
        "absolute size-4 opacity-0 transition-opacity",
        ACCORDION_EASE,
        "group-data-panel-open/accordion-trigger:opacity-80",
      )}
    />
  </span>
);

export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props): React.ReactElement {
  const variant = useContext(AccordionVariantContext);
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group/accordion-trigger flex flex-1 cursor-pointer items-start justify-between gap-4 rounded-md py-4 text-left font-medium text-sm outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64",
          className,
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
        {variant === "plus" ? <PlusMinusIndicator /> : <ChevronIndicator />}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionPanel({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props): React.ReactElement {
  return (
    <AccordionPrimitive.Panel
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden text-muted-foreground text-sm transition-[height] data-ending-style:h-0 data-starting-style:h-0",
        ACCORDION_EASE,
      )}
      data-slot="accordion-panel"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { AccordionPrimitive, AccordionPanel as AccordionContent };
