"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { createContext, useContext } from "react";
import type React from "react";
import { cn } from "@/lib/utils";

// Four variants, all built from Base UI's Tabs primitive and sharing the
// button-language styling (box-shadow ring + inset bezel + dark gradient):
//   - default   — recessed container, raised chip indicator (the pill look)
//   - segmented — outline container, primary fill on the active tab
//   - underline — no container, 2px primary bar under/beside the active tab
//   - ghost     — no container, ghost tabs, short primary bar on active tab
export type TabsVariant = "default" | "segmented" | "underline" | "ghost";

const TabsVariantContext = createContext<TabsVariant>("default");

export function Tabs({
  className,
  ...props
}: TabsPrimitive.Root.Props): React.ReactElement {
  return (
    <TabsPrimitive.Root
      className={cn(
        "flex flex-col gap-2 data-[orientation=vertical]:flex-row",
        className,
      )}
      data-slot="tabs"
      {...props}
    />
  );
}

// Indicator base — fill the active tab exactly (bezel/fill variants).
const FILL_INDICATOR_BASE =
  "absolute bottom-0 left-0 -z-0 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-(--active-tab-bottom) transition-[width,height,translate] duration-[180ms] [transition-timing-function:cubic-bezier(.22,.61,.36,1)]";

// Indicator base — thin bar under (horizontal) or beside (vertical) the tab.
const BAR_INDICATOR_BASE =
  "absolute bg-primary transition-[width,height,translate] duration-[180ms] [transition-timing-function:cubic-bezier(.22,.61,.36,1)] data-[orientation=horizontal]:bottom-0 data-[orientation=horizontal]:left-0 data-[orientation=horizontal]:h-0.5 data-[orientation=horizontal]:w-(--active-tab-width) data-[orientation=horizontal]:translate-x-(--active-tab-left) data-[orientation=horizontal]:translate-y-px data-[orientation=vertical]:top-0 data-[orientation=vertical]:left-0 data-[orientation=vertical]:w-0.5 data-[orientation=vertical]:h-(--active-tab-height) data-[orientation=vertical]:translate-y-(--active-tab-top) data-[orientation=vertical]:-translate-x-px";

export function TabsList({
  variant = "default",
  fullWidth = false,
  className,
  children,
  ...props
}: TabsPrimitive.List.Props & {
  variant?: TabsVariant;
  /**
   * When `true`, the list stretches to fill its horizontal container. For
   * the `underline` variant this extends the bottom border past the tabs
   * out to the container edges. Ignored in vertical orientation.
   */
  fullWidth?: boolean;
}): React.ReactElement {
  const listClass = cn(
    "relative z-0 flex items-center text-muted-foreground data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch",
    fullWidth
      ? "w-fit data-[orientation=horizontal]:w-full data-[orientation=horizontal]:justify-start"
      : "w-fit justify-center",
    variant === "default" &&
      "gap-x-0.5 rounded-lg bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)] dark:bg-[color-mix(in_srgb,var(--foreground)_14%,var(--background))] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.28)]",
    variant === "segmented" &&
      "gap-x-0.5 rounded-lg bg-background p-0.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_24%,var(--background)),0_1px_2px_rgb(0_0_0/0.05)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_7%,var(--background)),color-mix(in_srgb,var(--foreground)_1%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
    variant === "underline" &&
      "gap-1 data-[orientation=horizontal]:border-b data-[orientation=horizontal]:border-border data-[orientation=vertical]:border-l data-[orientation=vertical]:border-border",
    variant === "ghost" && "gap-1",
    className,
  );

  const indicatorClass = cn(
    variant === "default" &&
      cn(
        FILL_INDICATOR_BASE,
        "rounded-md bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_14%,var(--background)),0_1px_2px_rgb(0_0_0/0.06)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--foreground)_10%,var(--background)),color-mix(in_srgb,var(--foreground)_2%,var(--background)))] dark:shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_1px_2px_rgb(0_0_0/0.2)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
      ),
    variant === "segmented" &&
      cn(
        FILL_INDICATOR_BASE,
        "rounded-md bg-primary shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_28%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_18%,transparent)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28),0_-1px_0_rgb(0_0_0/0.08)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_96%,black),color-mix(in_srgb,var(--primary)_72%,black))] dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_40%,black),0_1px_2px_color-mix(in_srgb,var(--primary)_28%,transparent)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.22),0_-1px_0_rgb(0_0_0/0.2)]",
      ),
    variant === "underline" && BAR_INDICATOR_BASE,
    variant === "ghost" && BAR_INDICATOR_BASE,
  );

  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        className={listClass}
        data-slot="tabs-list"
        data-variant={variant}
        {...props}
      >
        {children}
        <TabsPrimitive.Indicator
          className={indicatorClass}
          data-slot="tab-indicator"
        />
      </TabsPrimitive.List>
    </TabsVariantContext.Provider>
  );
}

export function TabsTab({
  className,
  ...props
}: TabsPrimitive.Tab.Props): React.ReactElement {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative shrink-0 cursor-pointer whitespace-nowrap rounded-md font-medium outline-none transition-[color,background-color] duration-[120ms] ease-out focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-64 flex items-center justify-center gap-1.5 text-sm data-[orientation=vertical]:justify-start sm:text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0",
        variant === "default" &&
          "relative z-10 h-8 px-3 hover:text-foreground data-active:text-foreground",
        variant === "segmented" &&
          "relative z-10 h-8 px-3 hover:text-foreground data-active:text-primary-foreground",
        variant === "underline" &&
          "h-9 px-3 hover:text-foreground data-active:text-foreground",
        variant === "ghost" &&
          "h-9 px-3 hover:bg-accent hover:text-foreground data-active:text-primary",
        className,
      )}
      data-slot="tabs-tab"
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: TabsPrimitive.Panel.Props): React.ReactElement {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { TabsPrimitive, TabsTab as TabsTrigger, TabsPanel as TabsContent };
