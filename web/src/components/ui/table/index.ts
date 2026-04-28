/**
 * Re-export TanStack Table primitives so consumers don't need a second
 * import. `createColumnHelper` is the type-safe way to build columns:
 *
 *   const col = createColumnHelper<Domain>();
 *   const columns = [col.accessor("name", { header: "Name" }), …];
 */
export {
  createColumnHelper,
  flexRender,
  type ColumnDef,
  type Row,
  type Table as ReactTable,
} from "@tanstack/react-table";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  type TableVariant,
} from "./primitives";

export { DataTable } from "./data-table";
export { DataTableFilterCombobox } from "./filter-combobox";
export { DataTablePaginationFooter } from "./pagination-footer";
export { createSelectionColumn } from "./selection";
export type {
  DataTableAppearance,
  DataTableColumnDef,
  DataTableDensity,
  DataTableFilter,
  DataTableProps,
} from "./types";
