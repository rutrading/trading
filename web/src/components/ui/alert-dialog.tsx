"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export const AlertDialogCreateHandle: typeof AlertDialogPrimitive.createHandle =
  AlertDialogPrimitive.createHandle;

export const AlertDialog: typeof AlertDialogPrimitive.Root =
  AlertDialogPrimitive.Root;

export const AlertDialogPortal: typeof AlertDialogPrimitive.Portal =
  AlertDialogPrimitive.Portal;

export function AlertDialogTrigger(
  props: AlertDialogPrimitive.Trigger.Props,
): React.ReactElement {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

export function AlertDialogClose(
  props: AlertDialogPrimitive.Close.Props,
): React.ReactElement {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
  );
}

export function AlertDialogBackdrop({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/32 backdrop-blur-sm transition-opacity duration-[200ms] ease-out data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      data-slot="alert-dialog-backdrop"
      {...props}
    />
  );
}

export function AlertDialogViewport({
  className,
  ...props
}: AlertDialogPrimitive.Viewport.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
        className,
      )}
      data-slot="alert-dialog-viewport"
      {...props}
    />
  );
}

export function AlertDialogPopup({
  className,
  children,
  bottomStickOnMobile = true,
  portalProps,
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  bottomStickOnMobile?: boolean;
  portalProps?: AlertDialogPrimitive.Portal.Props;
}): React.ReactElement {
  return (
    <AlertDialogPortal {...portalProps}>
      <AlertDialogBackdrop />
      <AlertDialogViewport
        className={cn(
          bottomStickOnMobile &&
            "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12",
        )}
      >
        <AlertDialogPrimitive.Popup
          className={cn(
            "relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg origin-center flex-col rounded-2xl bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-var(--nested-dialogs))] outline-none overflow-hidden shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background)),0_22px_52px_rgb(0_0_0/0.22)] inset-shadow-[0_1px_0_rgb(255_255_255/0.3)] transition-[scale,opacity,translate] duration-[200ms] ease-out data-ending-style:duration-[160ms] will-change-transform data-ending-style:opacity-0 data-starting-style:opacity-0 sm:scale-[calc(1-0.1*var(--nested-dialogs))] sm:data-ending-style:scale-98 sm:data-starting-style:scale-98 dark:shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_22px_52px_rgb(0_0_0/0.6)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.06)]",
            bottomStickOnMobile &&
              "max-sm:max-w-none max-sm:origin-bottom max-sm:rounded-none max-sm:data-ending-style:translate-y-4 max-sm:data-starting-style:translate-y-4",
            className,
          )}
          data-slot="alert-dialog-popup"
          {...props}
        >
          {children}
        </AlertDialogPrimitive.Popup>
      </AlertDialogViewport>
    </AlertDialogPortal>
  );
}

// Alert dialogs intentionally don't show a close X — user must pick an action.
export function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-6 in-[[data-slot=alert-dialog-popup]:has([data-slot=alert-dialog-panel-root])]:pb-4 max-sm:pb-4",
        className,
      )}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

export function AlertDialogBody({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement {
  const defaultProps = {
    className: cn("px-6 pb-5", className),
    "data-slot": "alert-dialog-body",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function AlertDialogPanel({
  className,
  scrollFade = true,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  scrollFade?: boolean;
}): React.ReactElement {
  const defaultProps = {
    className: cn("px-6 py-4", className),
    "data-slot": "alert-dialog-panel",
  };

  return (
    <div
      className="min-h-0 flex-1 border-t border-border"
      data-slot="alert-dialog-panel-root"
    >
      <ScrollArea scrollFade={scrollFade}>
        {useRender({
          defaultTagName: "div",
          props: mergeProps<"div">(defaultProps, props),
          render,
        })}
      </ScrollArea>
    </div>
  );
}

export function AlertDialogFooter({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}): React.ReactElement {
  const defaultProps = {
    className: cn(
      "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end",
      variant === "default" &&
        "border-t border-border bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] py-3 dark:bg-[color-mix(in_srgb,var(--foreground)_12%,var(--background))]",
      variant === "bare" && "pb-6",
      className,
    ),
    "data-slot": "alert-dialog-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
}

export function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Title
      className={cn("font-semibold text-lg leading-none", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props): React.ReactElement {
  return (
    <AlertDialogPrimitive.Description
      className={cn("mt-1 text-muted-foreground text-sm", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

export {
  AlertDialogPrimitive,
  AlertDialogBackdrop as AlertDialogOverlay,
  AlertDialogPopup as AlertDialogContent,
};
