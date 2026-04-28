"use no memo";
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { DataTableColumnDef } from "./types";

/**
 * Type-safe factory for the leading "select" column. Plug into the start of
 * a `DataTableColumnDef<T>[]` array. The header checkbox toggles the entire
 * page; row checkboxes toggle individual rows. Both render inside a centered
 * flex wrapper so they line up vertically with each other regardless of cell
 * padding.
 */
export function createSelectionColumn<TData>(): DataTableColumnDef<TData> {
  return {
    id: "_select",
    enableSorting: false,
    enableColumnFilter: false,
    enableResizing: false,
    size: 40,
    header: ({ table }) => {
      const allSelected = table.getIsAllPageRowsSelected();
      const someSelected = table.getIsSomePageRowsSelected();
      return (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && someSelected}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all rows"
          />
        </div>
      );
    },
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
        />
      </div>
    ),
  };
}
