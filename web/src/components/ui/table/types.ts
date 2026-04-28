import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

/**
 * Combobox-driven column filter.
 * `id` matches the column's `id` (or accessor key).
 */
export type DataTableFilter<TValue extends string = string> = {
  id: string;
  label: string;
  options: ReadonlyArray<{ value: TValue; label: string }>;
};

export type DataTableAppearance = "neutral" | "primary";
export type DataTableDensity = "compact" | "default" | "spacious";

/**
 * Each column's value type can differ across the array, so we use the
 * TanStack-recommended `any` for `TValue`. Per-column safety is preserved
 * via `createColumnHelper<TData>()`.
 */
// biome-ignore lint/suspicious/noExplicitAny: per-column value types vary
export type DataTableColumnDef<TData> = ColumnDef<TData, any>;

export type DataTableProps<TData> = {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  /**
   * Enable internal `RowSelectionState`. The user's `columns` array must
   * include the selection column themselves — call `createSelectionColumn()`
   * and put it at the start of the array.
   */
  enableSelection?: boolean;
  /** Show the Pagination footer. */
  pagination?: boolean;
  /** Initial page size when `pagination` is on. Default 10. */
  pageSize?: number;
  /** Combobox filter row above the table. */
  filters?: ReadonlyArray<DataTableFilter>;
  /** Rendered when the (filtered) row count is 0. */
  emptyState?: ReactNode;
  /** Header tone — `neutral` (default) or `primary` accent. */
  appearance?: DataTableAppearance;
  /** Body row vertical padding. Default `default` (py-3). */
  density?: DataTableDensity;
  /**
   * Allow drag-to-resize on column headers. Per-column behavior is controlled
   * by passing `enableResizing: false` on the column def (defaults to true
   * when this is on). Set initial widths via the column def's `size` option.
   */
  enableColumnResizing?: boolean;
  /**
   * Cap the table viewport height. When set, the table scrolls vertically
   * via ScrollArea inside this height. Horizontal scroll is always on via
   * ScrollArea regardless.
   */
  maxHeight?: number | string;
  /**
   * Reserve space for this many rows when the body is empty so the table's
   * vertical footprint doesn't collapse. Defaults to `pageSize` when
   * `pagination` is on, otherwise undefined (the empty state takes its
   * natural height).
   */
  reserveEmptyRows?: number;
  /** Optional className on the outer wrapper. */
  className?: string;
};
