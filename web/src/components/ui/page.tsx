"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Page-shell primitives for surfaces inside `SidebarInset` (or any
 * full-height pane that needs a header bar + scrollable body with a
 * consistent gutter).
 *
 * Single knob: `Page` sets `--page-gutter` (defaults to the project's
 * `--spacing(6)` scale). `PageHeader` and `PageBody` consume it via
 * `px-(--page-gutter)` / `p-(--page-gutter)` so retuning the gutter only
 * touches one CSS variable.
 *
 *   <Page>
 *     <PageHeader>
 *       <SidebarTrigger />
 *       <h2 className="flex-1 text-sm font-semibold">Dashboard</h2>
 *     </PageHeader>
 *     <PageBody>
 *       …content
 *     </PageBody>
 *   </Page>
 *
 * For surfaces hosting their own scrollable element (a long table, a chat
 * transcript) where the native scrollbar must reach the screen edge, pass
 * `bleed` to drop padding on a chosen edge:
 *
 *   <PageBody bleed="bottom">…</PageBody>      // pb-0
 *   <PageBody bleed="x">…</PageBody>            // px-0 (full-bleed media)
 *   <PageBody bleed="all">…</PageBody>          // p-0
 */

type PageProps = React.ComponentProps<"div">;

export const Page = (props: PageProps) => {
  const { className, ...rest } = props;
  return (
    <div
      data-slot="page"
      {...rest}
      className={cn(
        "flex flex-1 flex-col [--page-gutter:--spacing(4)]",
        className,
      )}
    />
  );
};

type PageHeaderProps = React.ComponentProps<"header"> & {
  /**
   * Show the bottom hairline divider. Default `true`. Drop it when the page
   * has no card chrome (e.g. floating sidebar variants where a stand-alone
   * horizontal line would just float in space).
   */
  divider?: boolean;
};

export const PageHeader = (props: PageHeaderProps) => {
  const { className, divider = true, ...rest } = props;
  return (
    <header
      data-slot="page-header"
      {...rest}
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 px-(--page-gutter)",
        divider && "border-b border-border",
        className,
      )}
    />
  );
};

export type PageBodyBleed =
  | "none"
  | "x"
  | "y"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "all";

type PageBodyProps = React.ComponentProps<"div"> & {
  /**
   * Drop padding on a chosen edge so native scrollbars / sticky chrome can
   * reach the page edge. Defaults to `none` (symmetric gutter on all sides).
   */
  bleed?: PageBodyBleed;
};

const BLEED_PADDING: Record<PageBodyBleed, string> = {
  none: "p-(--page-gutter)",
  x: "py-(--page-gutter)",
  y: "px-(--page-gutter)",
  top: "px-(--page-gutter) pb-(--page-gutter)",
  bottom: "px-(--page-gutter) pt-(--page-gutter)",
  left: "py-(--page-gutter) ps-0 pe-(--page-gutter)",
  right: "py-(--page-gutter) ps-(--page-gutter) pe-0",
  all: "p-0",
};

export const PageBody = (props: PageBodyProps) => {
  const { className, bleed = "none", ...rest } = props;
  return (
    <div
      data-slot="page-body"
      data-bleed={bleed === "none" ? undefined : bleed}
      {...rest}
      className={cn(
        "flex-1 overflow-y-auto overflow-x-clip",
        BLEED_PADDING[bleed],
        className,
      )}
    />
  );
};
