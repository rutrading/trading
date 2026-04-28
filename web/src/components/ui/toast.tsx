"use client";

import { Toast } from "@base-ui/react/toast";
import {
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type React from "react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export type ToastType = "info" | "success" | "warning" | "error" | "loading";

export type ToastVariant = "stroke" | "filled" | "inline-meta" | "tonal-title";

export type ToastButtonAction = {
  label: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
};

export type ToastInlineAction = {
  label: string;
  onClick?: () => void;
};

export type ToastData = {
  variant?: ToastVariant;
  timestamp?: string;
  actions?: ToastInlineAction[];
  buttonActions?: ToastButtonAction[];
  action?: ToastInlineAction;
  closable?: boolean;
  icon?: ReactNode;
  tooltipStyle?: boolean;
};

const TOAST_ICONS: Record<ToastType, ComponentType<{ className?: string }>> = {
  error: CircleAlertIcon,
  info: InfoIcon,
  loading: LoaderCircleIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
};

const TONE_ICON_COLOR: Record<ToastType, string> = {
  info: "text-sky-500",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-rose-500",
  loading: "text-muted-foreground",
};

const TONE_BG: Record<ToastType, string> = {
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  loading: "bg-muted-foreground",
};

const TONE_TITLE: Record<ToastType, string> = {
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-700 dark:text-amber-400",
  error: "text-rose-600 dark:text-rose-400",
  loading: "text-foreground",
};

type SwipeDirection = "up" | "down" | "left" | "right";

function getSwipeDirection(position: ToastPosition): SwipeDirection[] {
  const verticalDirection: SwipeDirection = position.startsWith("top")
    ? "up"
    : "down";

  if (position.includes("center")) {
    return [verticalDirection];
  }

  if (position.includes("left")) {
    return ["left", verticalDirection];
  }

  return ["right", verticalDirection];
}

function upsertReplayClassName(toast: {
  type?: string;
  updateKey?: number;
}): string | undefined {
  const k = toast.updateKey ?? 0;
  if (k <= 0) return undefined;
  const isEven = k % 2 === 0;
  if (toast.type === "error") {
    return isEven ? "animate-toast-error-even" : "animate-toast-error-odd";
  }
  return isEven ? "animate-toast-success-even" : "animate-toast-success-odd";
}

function FilledToneIcon({ type }: { type: ToastType }) {
  const Icon = TOAST_ICONS[type];
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
        TONE_BG[type],
      )}
    >
      {type === "success" ? (
        <CheckIcon className="size-2.5 text-white" strokeWidth={3.5} />
      ) : (
        <Icon className={cn("size-2.5 text-white", type === "loading" && "animate-spin")} />
      )}
    </span>
  );
}

function CloseX() {
  return (
    <Toast.Close
      aria-label="Dismiss"
      render={<Button size="icon-xs" variant="ghost" />}
    >
      <XIcon />
    </Toast.Close>
  );
}

function InlineLinkActions({ actions }: { actions: ToastInlineAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {actions.map((a, i) => (
        <div key={a.label} className="flex items-center gap-2">
          {i > 0 ? <span className="text-muted-foreground/40">·</span> : null}
          <Button
            variant="link"
            onClick={a.onClick}
            className="h-auto p-0 text-xs font-medium underline-offset-2"
          >
            {a.label}
          </Button>
        </div>
      ))}
    </div>
  );
}

function ButtonActions({ actions }: { actions: ToastButtonAction[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <Button
          key={a.label}
          size="xs"
          variant={a.variant ?? "outline"}
          onClick={a.onClick}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function CompactLayout({
  type,
  data,
}: {
  type: ToastType;
  data: ToastData;
}) {
  const closable = data.closable ?? true;
  const icon = data.icon ?? <FilledToneIcon type={type} />;
  return (
    <div className="flex items-stretch gap-2 px-2.5 py-2 text-xs font-medium">
      <span className="flex shrink-0 items-center">{icon}</span>
      <Toast.Description
        className="flex flex-1 items-center truncate"
        data-slot="toast-description"
      />
      {data.action ? (
        <>
          <Separator orientation="vertical" className="h-4 self-center bg-border/80" />
          <Button size="xs" variant="ghost" onClick={data.action.onClick}>
            {data.action.label}
          </Button>
        </>
      ) : null}
      {closable && !data.action ? <CloseX /> : null}
    </div>
  );
}

function RichLayout({
  type,
  data,
}: {
  type: ToastType;
  data: ToastData;
}) {
  const variant = data.variant ?? "stroke";
  const closable = data.closable ?? true;

  const leading = (() => {
    if (data.icon) return <span className="size-3.5 shrink-0">{data.icon}</span>;
    if (variant === "tonal-title") return null;
    if (variant === "filled") return <FilledToneIcon type={type} />;
    const Icon = TOAST_ICONS[type];
    return (
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          TONE_ICON_COLOR[type],
          type === "loading" && "animate-spin",
        )}
      />
    );
  })();

  const titleClass =
    variant === "tonal-title"
      ? cn("text-xs font-semibold leading-5", TONE_TITLE[type])
      : "text-xs font-semibold leading-5";

  const gridCols = leading ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto]";
  const contentCol = leading ? "col-start-2" : "col-start-1";
  const contentSpan = leading ? "col-span-2" : "col-span-2";

  if (variant === "inline-meta") {
    return (
      <div className={cn("grid items-start gap-x-2 p-2.5", gridCols)}>
        {leading ? (
          <span className={cn("row-start-1 self-center", !leading ? "" : "col-start-1")}>
            {leading}
          </span>
        ) : null}
        <div className={cn("row-start-1 flex items-center gap-2 self-center", contentCol)}>
          <Toast.Title className={titleClass} data-slot="toast-title" />
          {data.timestamp ? (
            <>
              <Separator orientation="vertical" className="h-3 bg-border/80" />
              <span className="text-[10px] text-muted-foreground/60">{data.timestamp}</span>
            </>
          ) : null}
        </div>
        {closable ? (
          <div className={cn("row-start-1 self-center", leading ? "col-start-3" : "col-start-2")}>
            <CloseX />
          </div>
        ) : null}
        <Toast.Description
          className={cn(contentSpan, contentCol, "mt-0.5 text-xs leading-snug text-muted-foreground")}
          data-slot="toast-description"
        />
        {data.actions?.length ? (
          <div className={cn(contentSpan, contentCol, "mt-1")}>
            <InlineLinkActions actions={data.actions} />
          </div>
        ) : null}
        {data.buttonActions?.length ? (
          <div className={cn(contentSpan, contentCol, "mt-2")}>
            <ButtonActions actions={data.buttonActions} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("grid items-start gap-x-2 p-2.5", gridCols)}>
      {leading ? <span className="col-start-1 row-start-1 self-center">{leading}</span> : null}
      <Toast.Title
        className={cn(contentCol, "row-start-1 self-center", titleClass)}
        data-slot="toast-title"
      />
      {closable ? (
        <div className={cn(leading ? "col-start-3" : "col-start-2", "row-start-1 self-center")}>
          <CloseX />
        </div>
      ) : null}
      <Toast.Description
        className={cn(contentSpan, contentCol, "mt-0.5 text-xs leading-snug text-muted-foreground")}
        data-slot="toast-description"
      />
      {data.timestamp ? (
        <p className={cn(contentSpan, contentCol, "mt-0.5 text-[10px] text-muted-foreground/60")}>
          {data.timestamp}
        </p>
      ) : null}
      {data.actions?.length ? (
        <div className={cn(contentSpan, contentCol, "mt-1")}>
          <InlineLinkActions actions={data.actions} />
        </div>
      ) : null}
      {data.buttonActions?.length ? (
        <div className={cn(contentSpan, contentCol, "mt-2")}>
          <ButtonActions actions={data.buttonActions} />
        </div>
      ) : null}
    </div>
  );
}

function ToastBody({
  toast,
}: {
  toast: {
    type?: string;
    title?: ReactNode;
    data?: unknown;
  };
}) {
  const type = (toast.type as ToastType | undefined) ?? "info";
  const data = (toast.data as ToastData | undefined) ?? {};
  const isCompact = !toast.title;
  return isCompact ? (
    <CompactLayout type={type} data={data} />
  ) : (
    <RichLayout type={type} data={data} />
  );
}

function Toasts({ position }: { position: ToastPosition }): React.ReactElement {
  const { toasts } = Toast.useToastManager();
  const swipeDirection = getSwipeDirection(position);

  return (
    <Toast.Portal data-slot="toast-portal">
      <Toast.Viewport
        className={cn(
          "fixed z-60 mx-auto flex w-[calc(100%-var(--toast-inset)*2)] max-w-90 [--toast-inset:--spacing(4)] sm:[--toast-inset:--spacing(8)]",
          "data-[position*=top]:top-(--toast-inset)",
          "data-[position*=bottom]:bottom-(--toast-inset)",
          "data-[position*=left]:left-(--toast-inset)",
          "data-[position*=right]:right-(--toast-inset)",
          "data-[position*=center]:left-1/2 data-[position*=center]:-translate-x-1/2",
        )}
        data-position={position}
        data-slot="toast-viewport"
      >
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            className={cn(
              "absolute z-[calc(9999-var(--toast-index))] h-(--toast-calc-height) w-full select-none overflow-hidden rounded-md bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-[0_6px_18px_rgb(0_0_0/0.12),0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background))] inset-shadow-[0_1px_0_rgb(255_255_255/0.45)] [transition:transform_.5s_cubic-bezier(.22,1,.36,1),opacity_.5s,height_.15s] dark:shadow-[0_6px_18px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.5)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
              "data-[position*=right]:right-0 data-[position*=right]:left-auto",
              "data-[position*=left]:right-auto data-[position*=left]:left-0",
              "data-[position*=center]:right-0 data-[position*=center]:left-0",
              "data-[position*=top]:top-0 data-[position*=top]:bottom-auto data-[position*=top]:origin-[50%_calc(50%-50%*min(var(--toast-index,0),1))]",
              "data-[position*=bottom]:top-auto data-[position*=bottom]:bottom-0 data-[position*=bottom]:origin-[50%_calc(50%+50%*min(var(--toast-index,0),1))]",
              "after:absolute after:left-0 after:h-[calc(var(--toast-gap)+1px)] after:w-full",
              "data-[position*=top]:after:top-full",
              "data-[position*=bottom]:after:bottom-full",
              "[--toast-calc-height:var(--toast-frontmost-height,var(--toast-height))] [--toast-gap:--spacing(3)] [--toast-peek:--spacing(3)] [--toast-scale:calc(max(0,1-(var(--toast-index)*.1)))] [--toast-shrink:calc(1-var(--toast-scale))]",
              "data-[position*=top]:[--toast-calc-offset-y:calc(var(--toast-offset-y)+var(--toast-index)*var(--toast-gap)+var(--toast-swipe-movement-y))]",
              "data-[position*=bottom]:[--toast-calc-offset-y:calc(var(--toast-offset-y)*-1+var(--toast-index)*var(--toast-gap)*-1+var(--toast-swipe-movement-y))]",
              "data-[position*=top]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--toast-peek))+(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]",
              "data-[position*=bottom]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--toast-peek))-(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]",
              "data-limited:opacity-0",
              "data-expanded:h-(--toast-height)",
              "data-position:data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-calc-offset-y))]",
              "data-[position*=top]:data-starting-style:transform-[translateY(calc(-100%-var(--toast-inset)))]",
              "data-[position*=bottom]:data-starting-style:transform-[translateY(calc(100%+var(--toast-inset)))]",
              "data-ending-style:opacity-0",
              "data-ending-style:not-data-limited:not-data-swipe-direction:transform-[translateY(calc(100%+var(--toast-inset)))]",
              "data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
              "data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
              "data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]",
              "data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]",
              "data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
              "data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
              "data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]",
              "data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]",
              upsertReplayClassName(toast),
            )}
            data-position={position}
            swipeDirection={swipeDirection}
            toast={toast}
          >
            <Toast.Content className="pointer-events-auto relative block transition-opacity duration-250 data-behind:not-data-expanded:pointer-events-none data-behind:opacity-0 data-expanded:opacity-100">
              <ToastBody toast={toast} />
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AnchoredToasts(): React.ReactElement {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal data-slot="toast-portal-anchored">
      <Toast.Viewport className="outline-none" data-slot="toast-viewport-anchored">
        {toasts.map((toast) => {
          const data = (toast.data as ToastData | undefined) ?? {};
          const tooltipStyle = data.tooltipStyle ?? false;
          const positionerProps = toast.positionerProps;
          if (!positionerProps?.anchor) return null;

          return (
            <Toast.Positioner
              key={toast.id}
              className="z-50 max-w-[min(--spacing(64),var(--available-width))]"
              data-slot="toast-positioner"
              sideOffset={positionerProps.sideOffset ?? 4}
              toast={toast}
            >
              <Toast.Root
                className={cn(
                  "relative text-balance bg-popover not-dark:bg-clip-padding text-popover-foreground text-xs transition-[scale,opacity] shadow-[0_6px_18px_rgb(0_0_0/0.12),0_0_0_1px_color-mix(in_srgb,var(--foreground)_18%,var(--background))] inset-shadow-[0_1px_0_rgb(255_255_255/0.45)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:shadow-[0_6px_18px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.5)] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.08)]",
                  tooltipStyle ? "rounded-md" : "rounded-md",
                  upsertReplayClassName(toast),
                )}
                data-slot="toast-popup"
                toast={toast}
              >
                {tooltipStyle ? (
                  <Toast.Content className="pointer-events-auto px-2 py-1">
                    <Toast.Title data-slot="toast-title" />
                  </Toast.Content>
                ) : (
                  <Toast.Content className="pointer-events-auto relative block">
                    <ToastBody toast={toast} />
                  </Toast.Content>
                )}
              </Toast.Root>
            </Toast.Positioner>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export const toastManager: ReturnType<typeof Toast.createToastManager> =
  Toast.createToastManager();

export const anchoredToastManager: ReturnType<typeof Toast.createToastManager> =
  Toast.createToastManager();

export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ToastProviderProps extends Toast.Provider.Props {
  position?: ToastPosition;
}

export function ToastProvider({
  children,
  position = "bottom-right",
  ...props
}: ToastProviderProps): React.ReactElement {
  return (
    <Toast.Provider toastManager={toastManager} {...props}>
      {children}
      <Toasts position={position} />
    </Toast.Provider>
  );
}

export function AnchoredToastProvider({
  children,
  ...props
}: Toast.Provider.Props): React.ReactElement {
  return (
    <Toast.Provider toastManager={anchoredToastManager} {...props}>
      {children}
      <AnchoredToasts />
    </Toast.Provider>
  );
}

export { Toast as ToastPrimitive };
