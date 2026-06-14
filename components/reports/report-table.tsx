"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { exportRows } from "@/lib/export";

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
  if (rows.length === 0) {
    return <EmptyState title="Nothing to report" description="No records match this report right now." />;
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{rows.length} rows</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportRows(rows, fileBase, "csv")}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportRows(rows, fileBase, "xlsx")}>
            <Download className="h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{r[c.key] ?? "—"}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
