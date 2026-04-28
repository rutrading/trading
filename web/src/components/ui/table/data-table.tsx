// TanStack Table v8 doesn't yet play nice with React 19's compiler — opt
// out of auto-memoization at the module level so useReactTable's internal
// mutability isn't broken by compiler memoization.
"use no memo";
"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { DataTableFilterCombobox } from "./filter-combobox";
import { DataTablePaginationFooter } from "./pagination-footer";
import type {
  DataTableAppearance,
  DataTableDensity,
  DataTableProps,
} from "./types";

const HEADER_BG: Record<DataTableAppearance, string> = {
  neutral: "bg-muted/72 text-muted-foreground",
  primary:
    "bg-[color-mix(in_srgb,var(--primary)_8%,var(--background))] text-[var(--primary)]",
};

const ROW_PADDING: Record<DataTableDensity, string> = {
  compact: "py-1.5",
  default: "py-3",
  spacious: "py-4",
};

// Fallback row height in px before we measure a real row. The measured value
// from the first rendered data row replaces this once data is present.
const FALLBACK_ROW_HEIGHT: Record<DataTableDensity, number> = {
  compact: 36,
  default: 48,
  spacious: 56,
};


export function DataTable<TData>(props: DataTableProps<TData>) {
  const {
    columns,
    data,
    enableSelection = false,
    pagination = false,
    pageSize = 10,
    filters,
    emptyState,
    appearance = "neutral",
    density = "default",
    maxHeight,
    reserveEmptyRows,
    className,
  } = props;

  const reservedRows =
    reserveEmptyRows ?? (pagination ? pageSize : undefined);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable<TData>({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableSelection,
    enableColumnResizing: props.enableColumnResizing ?? false,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(pagination
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const hasFilters = !!filters?.length;
  const rows = table.getRowModel().rows;
  const hasRows = rows.length > 0;
  const headerGroups = table.getHeaderGroups();

  // Measure a real data row once it renders so spacer rows match the actual
  // pixel height (Badge / Avatar cells push real rows taller than &nbsp;).
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [measuredRowHeight, setMeasuredRowHeight] = useState<number | null>(
    null,
  );
  useEffect(() => {
    if (!hasRows) return;
    const firstRow = tbodyRef.current?.querySelector("tr:not([aria-hidden])");
    if (firstRow instanceof HTMLElement) {
      const h = firstRow.getBoundingClientRect().height;
      if (h > 0) setMeasuredRowHeight(h);
    }
  }, [hasRows, density, rows.length]);
  const spacerRowHeight = measuredRowHeight ?? FALLBACK_ROW_HEIGHT[density];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters!.map((f) => (
            <DataTableFilterCombobox key={f.id} filter={f} table={table} />
          ))}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-lg"
        style={maxHeight !== undefined ? { height: maxHeight } : undefined}
      >
        <ScrollArea scrollbarGutter>
        <table
          className="text-sm"
          style={{ width: "100%", minWidth: table.getTotalSize() }}
        >
          <thead>
            {headerGroups.map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header, i) => {
                  const isSelect = header.column.id === "_select";
                  const isLast = i === hg.headers.length - 1;
                  const sortable = header.column.getCanSort() && !isSelect;
                  // Last column flexes to absorb leftover horizontal space —
                  // no width, no resize handle. Real columns keep their
                  // explicit widths so resize doesn't redistribute siblings.
                  const resizable = header.column.getCanResize() && !isLast;
                  const dir = header.column.getIsSorted();
                  const headerNode = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      );
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "relative h-10 px-1 align-middle font-medium text-xs",
                        isSelect ? "text-center" : "text-left",
                        HEADER_BG[appearance],
                        i === 0 && "rounded-l-lg",
                        isLast && "rounded-r-lg",
                      )}
                      style={isLast ? undefined : { width: header.getSize() }}
                    >
                      {isSelect ? (
                        headerNode
                      ) : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "h-8 w-full px-2 text-xs font-medium",
                            appearance === "primary"
                              ? "text-[var(--primary)] hover:text-[var(--primary)]"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <span className="flex w-full items-center justify-start gap-1.5">
                            {headerNode}
                            {dir === "asc" ? (
                              <ChevronUp className="size-3 opacity-70" />
                            ) : dir === "desc" ? (
                              <ChevronDown className="size-3 opacity-70" />
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-30" />
                            )}
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center px-2">
                          {headerNode}
                        </span>
                      )}
                      {resizable && (
                        <span
                          aria-hidden
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            // 8px wide hit area, centered on the right edge.
                            // The visible spacer line sits inside via ::after.
                            "group/resize absolute -right-1 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none select-none items-center justify-center",
                            "after:block after:h-4 after:w-0.5 after:rounded-full after:bg-foreground/25 after:transition-colors",
                            "hover:after:bg-foreground/55",
                            header.column.getIsResizing() &&
                              "after:!bg-primary after:!h-6 after:!w-1",
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody ref={tbodyRef}>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className="data-[state=selected]:bg-muted/40 hover:bg-muted/30 transition-colors"
              >
                {row.getVisibleCells().map((cell, ci) => {
                  const isSelect = cell.column.id === "_select";
                  const cells = row.getVisibleCells();
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-3 align-middle",
                        ROW_PADDING[density],
                        isSelect && "text-center",
                        ci === 0 && "rounded-l-lg",
                        ci === cells.length - 1 && "rounded-r-lg",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {reservedRows !== undefined && rows.length < reservedRows
              ? // Pad with spacer rows so body height equals a full data page,
                // whether the page is partially full or completely empty.
                Array.from({ length: reservedRows - rows.length }).map((_, i) => (
                  <tr key={`spacer-${i}`} aria-hidden>
                    <td
                      colSpan={columns.length}
                      className={cn("px-3 align-middle", ROW_PADDING[density])}
                      style={{ height: spacerRowHeight }}
                    >
                      &nbsp;
                    </td>
                  </tr>
                ))
              : null}
            {!hasRows && reservedRows === undefined && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 text-center text-muted-foreground text-sm"
                  style={{ paddingTop: 48, paddingBottom: 48 }}
                >
                  {emptyState ?? "No results."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </ScrollArea>
        {!hasRows && reservedRows !== undefined && (
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center justify-center"
            style={{
              top: 40, // header height
              height: spacerRowHeight * reservedRows,
            }}
          >
            <div className="pointer-events-auto">
              {emptyState ?? (
                <div className="px-3 text-center text-muted-foreground text-sm">
                  No results.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {pagination && <DataTablePaginationFooter table={table} />}
    </div>
  );
}
