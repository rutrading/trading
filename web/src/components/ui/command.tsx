"use client";

import { Dialog as CommandDialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePrimitive,
  AutocompleteSeparator,
} from "@/components/ui/autocomplete";
import { Kbd } from "@/components/ui/kbd";

export const CommandDialog: typeof CommandDialogPrimitive.Root =
  CommandDialogPrimitive.Root;

export const CommandDialogPortal: typeof CommandDialogPrimitive.Portal =
  CommandDialogPrimitive.Portal;

export const CommandCreateHandle: typeof CommandDialogPrimitive.createHandle =
  CommandDialogPrimitive.createHandle;

export function CommandDialogTrigger(
  props: CommandDialogPrimitive.Trigger.Props,
): React.ReactElement {
  return (
    <CommandDialogPrimitive.Trigger
      data-slot="command-dialog-trigger"
      {...props}
    />
  );
}

export function CommandDialogBackdrop({
  className,
  ...props
}: CommandDialogPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <CommandDialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="command-dialog-backdrop"
      {...props}
    />
  );
}

export function CommandDialogViewport({
  className,
  ...props
}: CommandDialogPrimitive.Viewport.Props): React.ReactElement {
  return (
    <CommandDialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center px-4 py-[max(--spacing(4),4vh)] sm:py-[10vh]",
        className,
      )}
      data-slot="command-dialog-viewport"
      {...props}
    />
  );
}

export function CommandDialogPopup({
  className,
  children,
  portalProps,
  ...props
}: CommandDialogPrimitive.Popup.Props & {
  portalProps?: CommandDialogPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <CommandDialogPortal {...portalProps}>
      <CommandDialogBackdrop />
      <CommandDialogViewport>
        <CommandDialogPrimitive.Popup
          className={cn(
            "relative row-start-2 flex max-h-105 min-h-0 w-full min-w-0 max-w-xl -translate-y-[calc(1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground opacity-[calc(1-0.1*var(--nested-dialogs))] outline-none transition-[scale,opacity,translate] duration-200 ease-in-out will-change-transform shadow-[0_8px_24px_rgb(0_0_0/0.08),0_2px_8px_rgb(0_0_0/0.05)] data-nested:data-ending-style:translate-y-8 data-nested:data-starting-style:translate-y-8 data-nested-dialog-open:origin-top data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:shadow-[0_8px_24px_rgb(0_0_0/0.4),0_2px_8px_rgb(0_0_0/0.3),0_0_0_1px_rgb(255_255_255/0.06)]",
            className,
          )}
          data-slot="command-dialog-popup"
          {...props}
        >
          {children}
        </CommandDialogPrimitive.Popup>
      </CommandDialogViewport>
    </CommandDialogPortal>
  );
}

export function Command({
  autoHighlight = "always",
  keepHighlight = true,
  ...props
}: React.ComponentProps<typeof Autocomplete>): React.ReactElement {
  return (
    <Autocomplete
      autoHighlight={autoHighlight}
      inline
      keepHighlight={keepHighlight}
      open
      {...props}
    />
  );
}

export function CommandInput({
  className,
  hint = "⌘/",
  placeholder = "Type a command or search",
  ...props
}: Omit<AutocompletePrimitive.Input.Props, "size"> & {
  hint?: React.ReactNode | null;
}): React.ReactElement {
  return (
    <div className="relative border-b border-border" data-slot="command-input-row">
      {/* Aligned to the icon-chip column: list px-1 (4) + item px-2.5 (10) +
          chip half-width (12) = center at 26px → start-[18px] + size-4/2. */}
      <SearchIcon className="pointer-events-none absolute start-[18px] top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <AutocompletePrimitive.Input
        autoFocus
        className={cn(
          // ps-12 lines placeholder + caret with item text:
          // list px-1 (4) + item px-2.5 (10) + chip (24) + gap-2.5 (10) = 48.
          "h-11 w-full bg-transparent ps-12 text-sm text-foreground outline-none placeholder:text-muted-foreground",
          hint ? "pe-14" : "pe-4",
          className,
        )}
        data-slot="command-input"
        placeholder={placeholder}
        {...props}
      />
      {hint ? (
        <div className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">
          <CommandHintPill>{hint}</CommandHintPill>
        </div>
      ) : null}
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteList>): React.ReactElement {
  return (
    <AutocompleteList
      className={cn("not-empty:scroll-py-2 not-empty:py-2 not-empty:px-1", className)}
      data-slot="command-list"
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteEmpty>): React.ReactElement {
  return (
    <AutocompleteEmpty
      className={cn("not-empty:py-8 not-empty:text-center", className)}
      data-slot="command-empty"
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroup>): React.ReactElement {
  return (
    <AutocompleteGroup
      className={className}
      data-slot="command-group"
      {...props}
    />
  );
}

export function CommandGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroupLabel>): React.ReactElement {
  return (
    <AutocompleteGroupLabel
      className={cn("px-2.5 py-1 text-xs font-medium text-muted-foreground", className)}
      data-slot="command-group-label"
      {...props}
    />
  );
}

export function CommandGroupHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-2.5 py-1",
        className,
      )}
      data-slot="command-group-header"
      {...props}
    />
  );
}

export function CommandCollection({
  ...props
}: React.ComponentProps<typeof AutocompleteCollection>): React.ReactElement {
  return <AutocompleteCollection data-slot="command-collection" {...props} />;
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteItem>): React.ReactElement {
  return (
    <AutocompleteItem
      className={cn(
        "min-h-8 gap-2.5 rounded-md px-2.5 py-1 text-sm",
        className,
      )}
      data-slot="command-item"
      {...props}
    />
  );
}

export function CommandIconChip({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_24%,var(--background))] inset-shadow-[0_1px_0_rgb(255_255_255/0.3),0_-1px_0_rgb(0_0_0/0.04)] [&>svg]:size-3.5 [&>svg]:opacity-90 dark:bg-transparent dark:shadow-[0_0_0_1px_rgb(0_0_0/0.36)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08),0_-1px_0_rgb(0_0_0/0.12)]",
        className,
      )}
      data-slot="command-icon-chip"
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteSeparator>): React.ReactElement {
  return (
    <AutocompleteSeparator
      className={cn("my-1.5", className)}
      data-slot="command-separator"
      {...props}
    />
  );
}

export function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement {
  return (
    <kbd
      className={cn(
        "ms-auto font-medium font-sans text-muted-foreground/72 text-xs tracking-widest",
        className,
      )}
      data-slot="command-shortcut"
      {...props}
    />
  );
}

export function CommandHintPill({
  className,
  ...props
}: React.ComponentProps<typeof Kbd>): React.ReactElement {
  return (
    <Kbd
      className={cn(
        "h-5.5 min-w-5.5 rounded-md bg-transparent px-1.5 text-[11px] font-medium text-muted-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_14%,var(--background))] dark:bg-transparent dark:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_22%,var(--background))]",
        className,
      )}
      data-slot="command-hint-pill"
      {...props}
    />
  );
}

export function CommandFooter({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground",
        className,
      )}
      data-slot="command-footer"
      {...props}
    />
  );
}

export function CommandFooterHint({
  kbd,
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  kbd: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      className={cn("flex items-center gap-1.5", className)}
      data-slot="command-footer-hint"
      {...props}
    >
      <CommandHintPill>{kbd}</CommandHintPill>
      {children}
    </span>
  );
}

export { CommandDialogPrimitive };
