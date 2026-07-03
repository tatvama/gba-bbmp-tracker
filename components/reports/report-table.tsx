"use client";

import * as React from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataToolbar, DataToolbarSearch, DataToolbarSpacer } from "@/components/ui/data-toolbar";
import { PrintButton } from "@/components/print-button";
import { EmptyState } from "@/components/empty-state";
import { exportRows } from "@/lib/export";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export interface ReportColumn {
  key: string;
  label: string;
}

export function ReportTable({
  columns,
  rows,
  fileBase,
}: {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  fileBase: string;
}) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => columns.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q)));
  }, [rows, columns, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  React.useEffect(() => setPage(0), [search]);

  if (rows.length === 0) {
    return <EmptyState title="Nothing to report" description="No records match this report right now." />;
  }

  return (
    <div>
      <DataToolbar>
        <DataToolbarSearch value={search} onChange={setSearch} placeholder="Search this report…" />
        <span className="text-sm text-muted-foreground">
          {filtered.length === rows.length ? `${rows.length} rows` : `${filtered.length} of ${rows.length} rows`}
        </span>
        <DataToolbarSpacer />
        <div className="flex gap-2">
          <PrintButton />
          <Button variant="outline" size="sm" onClick={() => exportRows(filtered, fileBase, "csv")}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRows(filtered, fileBase, "xlsx")}>
            <Download className="h-4 w-4" /> XLSX
          </Button>
        </div>
      </DataToolbar>

      {filtered.length === 0 ? (
        <EmptyState compact title="No matching rows" description="Try a different search term." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => {
                const onCurrentPage = Math.floor(i / PAGE_SIZE) === currentPage;
                return (
                  <TableRow key={i} className={cn(!onCurrentPage && "hidden print:table-row")}>
                    {columns.map((c) => (
                      <TableCell key={c.key}>{r[c.key] ?? "—"}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="page-ctrl no-print mt-3 justify-center">
              <button
                type="button"
                className="page-btn"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-xs font-medium text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className="page-btn"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
