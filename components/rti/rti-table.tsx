"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Download, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { RtiWithRelations } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import { RTI_CATEGORIES, RTI_STATUSES, PRIORITIES, type DeadlineRules } from "@/lib/constants";
import { DEFAULT_DEADLINE_RULES } from "@/lib/constants";
import { activeDeadline } from "@/lib/rti-deadlines";
import { formatDate, orDash } from "@/lib/format";
import { exportRows } from "@/lib/export";

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors duration-150 cursor-pointer";

const DEADLINE_OPTIONS = [
  { value: "all", label: "Any deadline" },
  { value: "overdue", label: "Overdue" },
  { value: "due-today", label: "Due today" },
  { value: "due-soon", label: "Due soon" },
  { value: "due-10plus", label: "On track" },
];

export function RtiTable({
  data,
  rules = DEFAULT_DEADLINE_RULES,
}: {
  data: RtiWithRelations[];
  rules?: DeadlineRules;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "updated_at", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [deadline, setDeadline] = React.useState("all");

  const filtered = React.useMemo(
    () =>
      data.filter((r) => {
        if (status !== "all" && r.status !== status) return false;
        if (category !== "all" && r.category !== category) return false;
        if (priority !== "all" && r.priority !== priority) return false;
        if (deadline !== "all") {
          const active = activeDeadline(r, new Date(), rules);
          const bucket = active?.bucket ?? null;
          if (deadline === "overdue") {
            if (bucket !== "overdue" && bucket !== "critical-overdue") return false;
          } else if (bucket !== deadline) return false;
        }
        return true;
      }),
    [data, status, category, priority, deadline, rules],
  );

  const hasFilters =
    globalFilter !== "" ||
    status !== "all" ||
    category !== "all" ||
    priority !== "all" ||
    deadline !== "all";

  function reset() {
    setGlobalFilter("");
    setStatus("all");
    setCategory("all");
    setPriority("all");
    setDeadline("all");
  }

  const columns = React.useMemo<ColumnDef<RtiWithRelations>[]>(
    () => [
      {
        accessorKey: "internal_ref",
        header: ({ column }) => <SortBtn column={column} label="Ref" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold">
            {orDash(row.original.internal_ref)}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: "subject",
        header: ({ column }) => <SortBtn column={column} label="Subject" />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.original.subject}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <RtiStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {orDash(row.original.category)}
          </span>
        ),
      },
      {
        accessorKey: "priority",
        header: ({ column }) => <SortBtn column={column} label="Priority" />,
        cell: ({ row }) => <span className="text-sm">{row.original.priority}</span>,
        size: 90,
      },
      {
        id: "deadline",
        header: "Deadline",
        cell: ({ row }) => <DeadlineBadge rti={row.original} rules={rules} />,
        enableSorting: false,
      },
      {
        accessorKey: "updated_at",
        header: ({ column }) => <SortBtn column={column} label="Updated" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {formatDate(row.original.updated_at)}
          </span>
        ),
        size: 110,
      },
    ],
    [rules],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _col, value) => {
      const r = row.original;
      const hay = [r.internal_ref, r.subject, r.category, r.public_authority, r.pio_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(String(value).toLowerCase());
    },
    initialState: { pagination: { pageSize: 25 } },
  });

  function doExport(format: "csv" | "xlsx") {
    const rows = filtered.map((r) => ({
      ref: r.internal_ref ?? "",
      subject: r.subject,
      status: r.status,
      category: r.category ?? "",
      priority: r.priority,
      public_authority: r.public_authority ?? "",
      ward: r.ward ? `${r.ward.new_no} ${r.ward.new_name}` : "",
      date_filed: r.date_filed ?? "",
      normal_due: r.normal_due ?? "",
      first_appeal_due: r.first_appeal_due ?? "",
      updated_at: r.updated_at,
    }));
    exportRows(rows, "rti-tracker", format);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search ref, subject, authority…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-9 max-w-xs"
        />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Any status</option>
          {RTI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">Any category</option>
          {RTI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="all">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={selectCls} value={deadline} onChange={(e) => setDeadline(e.target.value)}>
          {DEADLINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <X className="h-4 w-4" /> Reset
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => doExport("csv")}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => doExport("xlsx")}>
            <Download className="h-4 w-4" /> XLSX
          </Button>
        </div>
      </div>

      <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No RTIs match these filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/rti/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtered.length} RTI{filtered.length === 1 ? "" : "s"}
          {hasFilters ? " (filtered)" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortBtn({
  column,
  label,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );
}
