"use no memo";
"use client";

import type { Table as ReactTable } from "@tanstack/react-table";
import {
  Combobox,
  ComboboxClear,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import type { DataTableFilter } from "./types";

export function DataTableFilterCombobox<TData>(props: {
  filter: DataTableFilter;
  table: ReactTable<TData>;
}) {
  const column = props.table.getColumn(props.filter.id);
  const value = (column?.getFilterValue() as string | undefined) ?? "";
  return (
    <Combobox
      value={value}
      onValueChange={(v: string | null) =>
        column?.setFilterValue(v || undefined)
      }
      items={[...props.filter.options]}
    >
      <ComboboxTrigger className="w-44 justify-between">
        <ComboboxValue placeholder={props.filter.label} />
        {value ? <ComboboxClear /> : null}
      </ComboboxTrigger>
      <ComboboxPopup>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item.value}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
