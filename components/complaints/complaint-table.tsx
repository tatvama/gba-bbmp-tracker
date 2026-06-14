"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { COMPLAINT_TYPES, COMPLAINT_STATUSES, PRIORITIES } from "@/lib/constants";
import { formatDate, orDash } from "@/lib/format";
import { exportRows } from "@/lib/export";
import type { ComplaintWithRelations } from "@/lib/types";

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors duration-150 cursor-pointer";
const today = new Date().toISOString().slice(0, 10);

export function ComplaintTable({ data }: { data: ComplaintWithRelations[] }) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "date_submitted", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [flag, setFlag] = React.useState("all"); // overdue | reply | action | noreply

  const filtered = React.useMemo(
    () => data.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (type !== "all" && c.type !== type) return false;
      if (priority !== "all" && c.priority !== priority) return false;
      if (flag === "overdue" && !(c.next_follow_up_date && c.next_follow_up_date < today)) return false;
      if (flag === "reply" && !c.latest_reply_date) return false;
      if (flag === "action" && !c.latest_action_taken_date) return false;
      if (flag === "noreply" && c.latest_reply_date) return false;
      return true;
    }),
    [data, status, type, priority, flag],
  );

  const hasFilters = globalFilter !== "" || status !== "all" || type !== "all" || priority !== "all" || flag !== "all";
  const reset = () => { setGlobalFilter(""); setStatus("all"); setType("all"); setPriority("all"); setFlag("all"); };

  const columns = React.useMemo<ColumnDef<ComplaintWithRelations>[]>(() => [
    { accessorKey: "internal_case_number", header: ({ column }) => <Sort column={column} label="Case no." />, cell: ({ row }) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{orDash(row.original.internal_case_number)}</span>, size: 160 },
    { accessorKey: "title", header: ({ column }) => <Sort column={column} label="Title" />, cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
    { id: "ward", header: "Ward", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.ward ? row.original.ward.new_no : "—"}</span>, size: 60 },
    { id: "engineer", header: "Engineer", cell: ({ row }) => <span className="text-sm text-muted-foreground">{orDash(row.original.assigned_engineer?.full_name)}</span> },
    { accessorKey: "date_submitted", header: ({ column }) => <Sort column={column} label="Given" />, cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.date_submitted)}</span>, size: 100 },
    { id: "reply", header: "Reply", cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.latest_reply_date)}</span>, size: 100 },
    { id: "action", header: "Action", cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDate(row.original.latest_action_taken_date)}</span>, size: 100 },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="muted">{row.original.status}</Badge> },
    { accessorKey: "priority", header: "Priority", cell: ({ row }) => <span className="text-sm">{orDash(row.original.priority)}</span>, size: 80 },
    { id: "followup", header: "Follow-up", cell: ({ row }) => { const d = row.original.next_follow_up_date; const over = d && d < today; return d ? <span className={`whitespace-nowrap text-xs ${over ? "font-semibold text-destructive" : ""}`}>{formatDate(d)}</span> : <span className="text-xs text-muted-foreground">—</span>; }, size: 100 },
  ], []);

  const table = useReactTable({
    data: filtered, columns, state: { sorting, globalFilter },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _c, value) => {
      const r = row.original;
      const hay = [r.internal_case_number, r.complaint_number, r.title, r.location, r.assigned_engineer?.full_name, r.latest_reply_summary, r.latest_action_taken_summary].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(String(value).toLowerCase());
    },
    initialState: { pagination: { pageSize: 25 } },
  });

  function doExport(format: "csv" | "xlsx") {
    exportRows(filtered.map((c) => ({
      case_no: c.internal_case_number ?? "", external_no: c.complaint_number ?? "", title: c.title, type: c.type,
      ward: c.ward ? `${c.ward.new_no} ${c.ward.new_name}` : "", engineer: c.assigned_engineer?.full_name ?? "",
      given: c.date_submitted ?? "", latest_reply: c.latest_reply_date ?? "", latest_action: c.latest_action_taken_date ?? "",
      status: c.status, priority: c.priority ?? "", next_follow_up: c.next_follow_up_date ?? "",
    })), "complaint-tracker", format);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search case no, title, OCR…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 max-w-xs" />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option>{COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}><option value="all">Any type</option>{COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="all">Any priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select className={selectCls} value={flag} onChange={(e) => setFlag(e.target.value)}>
          <option value="all">All</option><option value="overdue">Overdue follow-up</option><option value="reply">Reply received</option><option value="action">Action taken</option><option value="noreply">No reply</option>
        </select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4" /> Reset</Button>}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("csv")}><Download className="h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")}><Download className="h-4 w-4" /> XLSX</Button>
        </div>
      </div>
      <Table>
          <TableHeader>{table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>{hg.headers.map((h) => <TableHead key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>
          ))}</TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">No complaints match these filters.</TableCell></TableRow>
            ) : table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/complaints/${row.original.id}`)}>
                {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{filtered.length} complaint{filtered.length === 1 ? "" : "s"}{hasFilters ? " (filtered)" : ""}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="h-4 w-4" /></Button>
          <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}</span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function Sort({ column, label }: { column: { toggleSorting: (d?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }; label: string }) {
  return <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>{label}<ArrowUpDown className="h-3 w-3" /></button>;
}
