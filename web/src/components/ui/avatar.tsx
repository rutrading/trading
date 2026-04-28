"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { PlusIcon, UserIcon } from "lucide-react";
import type React from "react";
import { Children, type ComponentProps, type ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/lib/utils";

export type AvatarTone =
  | "neutral"
  | "amber"
  | "emerald"
  | "sky"
  | "blue"
  | "violet"
  | "pink"
  | "rose";

const TONE_CLASSES: Record<AvatarTone, string> = {
  neutral:
    "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",
  violet:
    "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-500/20 dark:text-pink-300",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
};

const TONE_CYCLE: AvatarTone[] = [
  "amber",
  "emerald",
  "sky",
  "blue",
  "violet",
  "pink",
  "rose",
];

export function avatarToneFromSeed(seed: string): AvatarTone {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TONE_CYCLE[hash % TONE_CYCLE.length];
}

export const avatarVariants = tv({
  base: "relative inline-flex shrink-0 select-none items-center justify-center overflow-visible bg-background align-middle font-semibold",
  variants: {
    size: {
      xs: "size-5 text-[10px]",
      sm: "size-6 text-xs",
      md: "size-8 text-sm",
      lg: "size-10 text-base",
      xl: "size-12 text-lg",
      "2xl": "size-14 text-xl",
    },
    shape: {
      circle: "rounded-full",
      square: "rounded-[25%]",
    },
  },
  defaultVariants: { size: "md", shape: "circle" },
});

export interface AvatarProps
  extends AvatarPrimitive.Root.Props,
    VariantProps<typeof avatarVariants> {}

export function Avatar({
  className,
  size,
  shape,
  ...props
}: AvatarProps): React.ReactElement {
  return (
    <AvatarPrimitive.Root
      className={cn(avatarVariants({ size, shape }), className)}
      data-slot="avatar"
      data-size={size ?? "md"}
      data-shape={shape ?? "circle"}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: AvatarPrimitive.Image.Props): React.ReactElement {
  return (
    <AvatarPrimitive.Image
      className={cn(
        "size-full rounded-[inherit] object-cover",
        className,
      )}
      data-slot="avatar-image"
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  tone = "neutral",
  ...props
}: AvatarPrimitive.Fallback.Props & {
  tone?: AvatarTone;
}): React.ReactElement {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        "flex size-full items-center justify-center rounded-[inherit]",
        TONE_CLASSES[tone],
        className,
      )}
      data-slot="avatar-fallback"
      data-tone={tone}
      {...props}
    />
  );
}

/**
 * Shorthand for the person-silhouette fallback shown when there's neither
 * an image nor initials available.
 */
export function AvatarIconFallback({
  className,
  tone = "neutral",
  ...props
}: Omit<AvatarPrimitive.Fallback.Props, "children"> & {
  tone?: AvatarTone;
}): React.ReactElement {
  return (
    <AvatarFallback
      className={cn("[&_svg]:size-[58%]", className)}
      tone={tone}
      {...props}
    >
      <UserIcon aria-hidden strokeWidth={2} />
    </AvatarFallback>
  );
}

export type AvatarBadgePosition =
  | "top-right"
  | "bottom-right"
  | "top-left"
  | "bottom-left";

/**
 * Shape-aware positioning (matches Tailwind UI's pattern):
 *  - Circle avatars: no translate. The badge sits at the corner of the
 *    bounding box, which is already outside the visible circle — so the
 *    badge naturally overlaps the avatar edge without drifting away.
 *  - Square avatars: translate by 1/2 the badge's own size so the badge's
 *    center lands on the corner — half inside, half outside the square.
 */
const BADGE_POSITION: Record<AvatarBadgePosition, string> = {
  "top-right":
    "top-0 right-0 in-data-[shape=square]:translate-x-1/2 in-data-[shape=square]:-translate-y-1/2",
  "bottom-right":
    "bottom-0 right-0 in-data-[shape=square]:translate-x-1/2 in-data-[shape=square]:translate-y-1/2",
  "top-left":
    "top-0 left-0 in-data-[shape=square]:-translate-x-1/2 in-data-[shape=square]:-translate-y-1/2",
  "bottom-left":
    "bottom-0 left-0 in-data-[shape=square]:-translate-x-1/2 in-data-[shape=square]:translate-y-1/2",
};

export interface AvatarBadgeProps extends ComponentProps<"span"> {
  position?: AvatarBadgePosition;
}

/**
 * Generic corner badge. Caller provides the content — a status dot, a
 * count (number), a brand logo, a verified check, etc. Shape inherits
 * from the parent Avatar's shape via `in-data-[shape=square]` — on a
 * square avatar the badge gets rounded-[30%] corners so it matches the
 * surrounding geometry; on a circle avatar it stays fully circular.
 */
export function AvatarBadge({
  className,
  position = "bottom-right",
  children,
  ...props
}: AvatarBadgeProps): React.ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 inline-flex items-center justify-center rounded-full in-data-[shape=square]:rounded-[30%] bg-background text-[10px] font-semibold leading-none ring-2 ring-background",
        BADGE_POSITION[position],
        className,
      )}
      data-slot="avatar-badge"
      data-position={position}
      {...props}
    >
      {children}
    </span>
  );
}

export type AvatarStatusTone = "online" | "offline" | "busy" | "away";

const STATUS_TONE: Record<AvatarStatusTone, string> = {
  online: "bg-emerald-500",
  offline: "bg-zinc-400",
  busy: "bg-rose-500",
  away: "bg-amber-500",
};

/**
 * Simple colored dot in the bottom-right corner. Sized relative to the
 * avatar — 25% of its width.
 */
export function AvatarStatus({
  tone = "online",
  position = "bottom-right",
  className,
  ...props
}: Omit<AvatarBadgeProps, "children"> & {
  tone?: AvatarStatusTone;
}): React.ReactElement {
  return (
    <AvatarBadge
      position={position}
      className={cn(
        /**
         * Status is always a circle dot, even on square avatars. 25% of
         * the avatar matches Tailwind's proportional sizing.
         */
        "size-1/4 rounded-full! p-0",
        STATUS_TONE[tone],
        className,
      )}
      data-slot="avatar-status"
      data-status={tone}
      {...props}
    />
  );
}

/**
 * Empty-state slot — dashed outline, + icon. For "invite / add user"
 * affordances.
 */
export function AvatarEmpty({
  className,
  size,
  shape,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof avatarVariants>): React.ReactElement {
  return (
    <button
      type="button"
      className={cn(
        avatarVariants({ size, shape }),
        "cursor-pointer border-2 border-dashed border-border bg-transparent text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground [&_svg]:size-[45%]",
        className,
      )}
      data-slot="avatar-empty"
      {...props}
    >
      <PlusIcon aria-hidden strokeWidth={2} />
    </button>
  );
}

export type AvatarGroupItem = {
  /** Used to derive initials + a deterministic tone via `avatarToneFromSeed`. */
  name?: string;
  /** Optional image source; renders `AvatarImage` when provided. */
  src?: string;
  /** Override the `<img>` alt text; defaults to `name`. */
  alt?: string;
  /** Override the derived initials (usually the first two letters of `name`). */
  initials?: string;
  /** Override the derived tone. */
  tone?: AvatarTone;
  /** Stable key for the rendered avatar; defaults to `name` or the index. */
  id?: string;
};

function deriveInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Overlapping stack. Children beyond `max` collapse into a `+N` tile.
 * Each child gets a background-matched ring so neighbours read as
 * distinct stacked circles.
 *
 * Two APIs:
 *   1. Children  — compose <Avatar> nodes yourself (most flexible).
 *   2. `items`   — data-driven shorthand. Pass an array of people; the
 *      group renders the avatars for you (initials + tone derived from
 *      `name`, image used when `src` is set).
 *
 * If both are provided, `items` wins.
 */
export interface AvatarGroupProps
  extends ComponentProps<"div">,
    VariantProps<typeof avatarVariants> {
  max?: number;
  spacing?: "tight" | "default" | "loose";
  items?: AvatarGroupItem[];
}

const GROUP_SPACING: Record<
  NonNullable<AvatarGroupProps["spacing"]>,
  string
> = {
  tight: "-space-x-3",
  default: "-space-x-2",
  loose: "-space-x-1",
};

export function AvatarGroup({
  className,
  size = "md",
  shape = "circle",
  spacing = "default",
  max,
  items,
  children,
  ...props
}: AvatarGroupProps): React.ReactElement {
  const rendered: React.ReactNode[] = items
    ? items.map((item, i) => {
        const name = item.name;
        const tone = item.tone ?? (name ? avatarToneFromSeed(name) : "neutral");
        return (
          <Avatar key={item.id ?? name ?? i} size={size} shape={shape}>
            {item.src ? (
              <AvatarImage src={item.src} alt={item.alt ?? name ?? ""} />
            ) : null}
            <AvatarFallback tone={tone}>
              {item.initials ?? deriveInitials(name)}
            </AvatarFallback>
          </Avatar>
        );
      })
    : Children.toArray(children);

  const visible = typeof max === "number" ? rendered.slice(0, max) : rendered;
  const overflow =
    typeof max === "number" && rendered.length > max
      ? rendered.length - max
      : 0;

  return (
    <div
      className={cn(
        "flex items-center",
        GROUP_SPACING[spacing],
        "[&_[data-slot=avatar]]:ring-2 [&_[data-slot=avatar]]:ring-background",
        className,
      )}
      data-slot="avatar-group"
      data-size={size}
      data-shape={shape}
      {...props}
    >
      {visible}
      {overflow > 0 ? (
        <Avatar size={size} shape={shape}>
          <AvatarFallback tone="neutral">+{overflow}</AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  );
}

export { AvatarPrimitive };
