"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Breadcrumb({
  ...props
}: React.ComponentProps<"nav">): React.ReactElement {
  return <nav aria-label="Breadcrumb" data-slot="breadcrumb" {...props} />;
}

export function BreadcrumbList({
  className,
  ...props
}: React.ComponentProps<"ol">): React.ReactElement {
  return (
    <ol
      role="list"
      className={cn("flex flex-wrap items-center gap-y-2 gap-x-4", className)}
      data-slot="breadcrumb-list"
      {...props}
    />
  );
}

export function BreadcrumbItem({
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement {
  return (
    <li
      className={cn("flex items-center gap-x-4", className)}
      data-slot="breadcrumb-item"
      {...props}
    />
  );
}

export function BreadcrumbLink({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">): React.ReactElement {
  const defaultProps = {
    className: cn(
      "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&>svg]:size-5 [&>svg]:shrink-0",
      className,
    ),
    "data-slot": "breadcrumb-link",
  };

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(defaultProps, props),
    render,
  });
}

export function BreadcrumbPage({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-current="page"
      className={cn(
        "text-sm font-medium text-foreground [&>svg]:size-5 [&>svg]:shrink-0",
        className,
      )}
      data-slot="breadcrumb-page"
      {...props}
    />
  );
}

export function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      role="presentation"
      className={cn(
        "inline-flex shrink-0 items-center text-muted-foreground/72 [&>svg]:size-5 [&>svg]:shrink-0",
        className,
      )}
      data-slot="breadcrumb-separator"
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </span>
  );
}

export function BreadcrumbSlashSeparator({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <BreadcrumbSeparator
      className={cn("text-muted-foreground/45", className)}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-5 shrink-0"
      >
        <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
      </svg>
    </BreadcrumbSeparator>
  );
}

export function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      role="presentation"
      className={cn(
        // h-5 + flex centering keeps the icon optically aligned with the
        // text-sm link baseline; inline-flex alone left it sitting low.
        "flex h-5 shrink-0 items-center justify-center text-muted-foreground",
        className,
      )}
      data-slot="breadcrumb-ellipsis"
      {...props}
    >
      <MoreHorizontalIcon className="size-4 shrink-0" />
      <span className="sr-only">More</span>
    </span>
  );
}
