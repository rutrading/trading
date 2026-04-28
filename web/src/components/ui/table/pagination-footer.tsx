"use no memo";
"use client";

import type { Table as ReactTable } from "@tanstack/react-table";
import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
  PaginationStatus,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function DataTablePaginationFooter<TData>(props: {
  table: ReactTable<TData>;
}) {
  const { table } = props;
  const totalPages = Math.max(1, table.getPageCount());
  const currentPage = table.getState().pagination.pageIndex + 1;
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();
  const disabledLink = "pointer-events-none opacity-64";
  const outline = buttonVariants({ variant: "outline", size: "default" });

  return (
    <Pagination>
      <PaginationContent layout="spread">
        <PaginationItem>
          <PaginationPrevious
            href="#"
            aria-disabled={!canPrev || undefined}
            className={cn(outline, !canPrev && disabledLink)}
            onClick={(e) => {
              e.preventDefault();
              if (canPrev) table.previousPage();
            }}
          />
        </PaginationItem>
        <PaginationItem>
          <PaginationStatus current={currentPage} total={totalPages} />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            aria-disabled={!canNext || undefined}
            className={cn(outline, !canNext && disabledLink)}
            onClick={(e) => {
              e.preventDefault();
              if (canNext) table.nextPage();
            }}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
