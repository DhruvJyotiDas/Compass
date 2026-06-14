"use client";

import { Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  page?: number;
  perPage?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  emptyMessage = "No records found.",
  onRowClick,
  sort,
  onSortChange,
  page = 1,
  perPage = 25,
  total = 0,
  onPageChange,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    onSortChange(sort === key ? `-${key}` : sort === `-${key}` ? key : key);
  };

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(c.sortable && "cursor-pointer select-none hover:text-foreground", c.className)}
                onClick={() => c.sortable && toggleSort(c.key)}
              >
                {c.header}
                {c.sortable && sort?.replace("-", "") === c.key && (sort?.startsWith("-") ? " ↓" : " ↑")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                className={onRowClick ? "cursor-pointer" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as React.ReactNode) ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {total > perPage && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange?.(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
