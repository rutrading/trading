"use client";

import type React from "react";
import { createContext, useContext } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPanel,
  AlertDialogPopup,
  AlertDialogPrimitive,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogPrimitive,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerPrimitive,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

// Popup — adaptive modal primitive. Dispatches to:
//   - Dialog      on desktop when dismissible (default)
//   - AlertDialog on desktop when `dismissible={false}` (alert-type)
//   - Drawer      on mobile — with backdrop-press + swipe disabled when
//                 `dismissible={false}`, so alert semantics survive the
//                 bottom-sheet treatment
//
// Reach for Popup by default for any modal UI. Use Dialog / AlertDialog /
// Drawer directly only when you explicitly want one layout on every
// viewport.

type PopupMode = "dialog" | "alert-dialog" | "drawer";

type PopupContextValue = {
  mode: PopupMode;
  dismissible: boolean;
};

const PopupContext = createContext<PopupContextValue | null>(null);

const usePopupContext = (): PopupContextValue => {
  const ctx = useContext(PopupContext);
  if (!ctx) {
    throw new Error("Popup subparts must be used inside <Popup>");
  }
  return ctx;
};

const resolveMode = (isMobile: boolean, dismissible: boolean): PopupMode => {
  if (isMobile) return "drawer";
  if (dismissible) return "dialog";
  return "alert-dialog";
};

type PopupProps = DialogPrimitive.Root.Props & {
  /**
   * When `false`, Escape / backdrop click no longer close the popup, and
   * the corner close X / swipe bar are hidden. On desktop this dispatches
   * to `AlertDialog`; on mobile it stays a `Drawer` with dismiss disabled.
   * Defaults to `true`.
   */
  dismissible?: boolean;
};

export const Popup = ({
  dismissible = true,
  ...props
}: PopupProps): React.ReactElement => {
  const isMobile = useMediaQuery("max-md");
  const mode = resolveMode(isMobile, dismissible);
  return (
    <PopupContext.Provider value={{ mode, dismissible }}>
      {mode === "drawer" ? (
        <Drawer
          {...(props as React.ComponentProps<typeof Drawer>)}
          disablePointerDismissal={!dismissible}
          {...(dismissible ? {} : { swipeDirection: undefined })}
        />
      ) : mode === "alert-dialog" ? (
        <AlertDialog {...(props as React.ComponentProps<typeof AlertDialog>)} />
      ) : (
        <Dialog {...props} disablePointerDismissal={!dismissible} />
      )}
    </PopupContext.Provider>
  );
};

type PopupTriggerProps = DialogPrimitive.Trigger.Props;

export const PopupTrigger = (
  props: PopupTriggerProps,
): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return <DrawerTrigger {...(props as DrawerPrimitive.Trigger.Props)} />;
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogTrigger
        {...(props as AlertDialogPrimitive.Trigger.Props)}
      />
    );
  }
  return <DialogTrigger {...props} />;
};

type PopupCloseProps = DialogPrimitive.Close.Props;

export const PopupClose = (props: PopupCloseProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return <DrawerClose {...(props as DrawerPrimitive.Close.Props)} />;
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogClose {...(props as AlertDialogPrimitive.Close.Props)} />
    );
  }
  return <DialogClose {...props} />;
};

type PopupContentProps = DialogPrimitive.Popup.Props & {
  showBar?: boolean;
};

export const PopupContent = ({
  showBar,
  ...props
}: PopupContentProps): React.ReactElement => {
  const { mode, dismissible } = usePopupContext();
  if (mode === "drawer") {
    const resolvedShowBar = dismissible ? (showBar ?? true) : false;
    return (
      <DrawerPopup
        showBar={resolvedShowBar}
        {...(props as React.ComponentProps<typeof DrawerPopup>)}
      />
    );
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogPopup
        {...(props as React.ComponentProps<typeof AlertDialogPopup>)}
      />
    );
  }
  return <DialogPopup {...props} />;
};

type PopupHeaderProps = React.ComponentProps<typeof DialogHeader>;

export const PopupHeader = (props: PopupHeaderProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return (
      <DrawerHeader
        {...(props as React.ComponentProps<typeof DrawerHeader>)}
      />
    );
  }
  if (mode === "alert-dialog") {
    // AlertDialogHeader intentionally has no close X.
    return (
      <AlertDialogHeader
        {...(props as React.ComponentProps<typeof AlertDialogHeader>)}
      />
    );
  }
  return <DialogHeader {...props} />;
};

type PopupTitleProps = DialogPrimitive.Title.Props;

export const PopupTitle = (props: PopupTitleProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return <DrawerTitle {...(props as DrawerPrimitive.Title.Props)} />;
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogTitle
        {...(props as AlertDialogPrimitive.Title.Props)}
      />
    );
  }
  return <DialogTitle {...props} />;
};

type PopupDescriptionProps = DialogPrimitive.Description.Props;

export const PopupDescription = (
  props: PopupDescriptionProps,
): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return (
      <DrawerDescription
        {...(props as DrawerPrimitive.Description.Props)}
      />
    );
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogDescription
        {...(props as AlertDialogPrimitive.Description.Props)}
      />
    );
  }
  return <DialogDescription {...props} />;
};

type PopupBodyProps = React.ComponentProps<typeof DialogBody>;

export const PopupBody = (props: PopupBodyProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return (
      <DrawerPanel
        scrollable={false}
        {...(props as React.ComponentProps<typeof DrawerPanel>)}
      />
    );
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogBody
        {...(props as React.ComponentProps<typeof AlertDialogBody>)}
      />
    );
  }
  return <DialogBody {...props} />;
};

type PopupPanelProps = React.ComponentProps<typeof DialogPanel>;

export const PopupPanel = (props: PopupPanelProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return (
      <DrawerPanel
        scrollable
        {...(props as React.ComponentProps<typeof DrawerPanel>)}
      />
    );
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogPanel
        {...(props as React.ComponentProps<typeof AlertDialogPanel>)}
      />
    );
  }
  return <DialogPanel {...props} />;
};

type PopupFooterProps = React.ComponentProps<typeof DialogFooter>;

export const PopupFooter = (props: PopupFooterProps): React.ReactElement => {
  const { mode } = usePopupContext();
  if (mode === "drawer") {
    return (
      <DrawerFooter
        {...(props as React.ComponentProps<typeof DrawerFooter>)}
      />
    );
  }
  if (mode === "alert-dialog") {
    return (
      <AlertDialogFooter
        {...(props as React.ComponentProps<typeof AlertDialogFooter>)}
      />
    );
  }
  return <DialogFooter {...props} />;
};
