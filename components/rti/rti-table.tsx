"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  RefreshCw,
  X,
  Plus,
  Eye,
  Construction,
  Lightbulb,
  Trash2,
  Folder,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Droplet,
  Briefcase,
  ArrowRight,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import { activeDeadline } from "@/lib/rti-deadlines";
import { formatDate } from "@/lib/format";
import { exportRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { RtiWithRelations } from "@/lib/types";
import {
  DEFAULT_DEADLINE_RULES,
  RTI_STATUSES,
  RTI_CATEGORIES,
  PRIORITIES,
} from "@/lib/constants";
import type { DeadlineRules } from "@/lib/constants";

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 dark:focus:ring-slate-800 cursor-pointer";

const DEADLINE_OPTIONS = [
  { value: "all", label: "Any deadline" },
  { value: "due-today", label: "Due Today" },
  { value: "due-soon", label: "Due Soon" },
  { value: "overdue", label: "Overdue" },
];

function getRelativeTime(dateInput: string | Date | null): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function orDash(val: any, fallback: string = "Not Available") {
  return val ? (
    val
  ) : (
    <span className="text-xs text-slate-450 dark:text-slate-500 italic font-medium">
      {fallback}
    </span>
  );
}

function getWorkflowStage(status: string): string {
  switch (status) {
    case "Draft":
    case "Ready to File":
      return "Draft";
    case "Filed":
    case "Awaiting Reply":
      return "PIO Reply";
    case "Reply Received":
    case "Partial Reply":
    case "Rejected":
    case "No Reply":
    case "First Appeal Drafted":
    case "First Appeal Filed":
      return "First Appeal";
    case "FAA Order Received":
    case "Second Appeal Drafted":
    case "Second Appeal Filed":
    case "Complaint Filed":
      return "Second Appeal";
    case "Closed":
      return "Closed";
    default:
      return "Pending";
  }
}

function CategoryChip({ category }: { category: string | null }) {
  if (!category) {
    return orDash(category);
  }

  let Icon = Folder;
  switch (category) {
    case "Road Work":
      Icon = Construction;
      break;
    case "Streetlight":
      Icon = Lightbulb;
      break;
    case "Garbage":
      Icon = Trash2;
      break;
    case "Drain Work":
      Icon = Droplet;
      break;
    case "Tender":
      Icon = Briefcase;
      break;
  }

  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 h-6 rounded-md border-slate-200 bg-slate-50 text-slate-700 font-medium text-xs dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-300"
    >
      <Icon className="h-3.5 w-3.5 text-slate-405 shrink-0" />
      {category}
    </Badge>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  let Icon = Minus;
  let cls = "";

  switch (priority) {
    case "Urgent":
      Icon = AlertTriangle;
      cls =
        "border-rose-200 bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400";
      break;
    case "High":
      Icon = ArrowUp;
      cls =
        "border-amber-200 bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400";
      break;
    case "Medium":
      Icon = Minus;
      cls =
        "border-blue-200 bg-blue-50/70 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-400";
      break;
    case "Low":
      Icon = ArrowDown;
      cls =
        "border-slate-200 bg-slate-50/70 text-slate-600 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-400";
      break;
    default:
      cls = "border-slate-200 bg-slate-50 text-slate-600";
  }

  return (
    <Badge
      variant="outline"
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 h-6 rounded-md font-semibold text-xs border", cls)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      {priority}
    </Badge>
  );
}

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
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);

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
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-foreground">
              {orDash(row.original.internal_ref, "Pending")}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
              {formatDate(row.original.created_at)}
            </span>
          </div>
        ),
        size: 110,
      },
      {
        accessorKey: "subject",
        header: ({ column }) => <SortBtn column={column} label="Subject" />,
        cell: ({ row }) => (
          <div className="flex flex-col py-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-bold text-sm text-slate-850 dark:text-slate-200 line-clamp-2 cursor-help max-w-md leading-relaxed">
                    {row.original.subject}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-3 leading-relaxed text-xs">
                  <p>{row.original.subject}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              <span className="font-mono">{row.original.internal_ref ?? "Pending"}</span>
              <span>•</span>
              <span>Created: {formatDate(row.original.created_at)}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <RtiStatusBadge status={row.original.status} />
            <span className="text-[10px] font-bold text-slate-455 dark:text-slate-500 uppercase tracking-wider pl-0.5">
              {row.original.status === "Closed" ? "Case Closed" : `Next: ${getWorkflowStage(row.original.status)}`}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => <CategoryChip category={row.original.category} />,
      },
      {
        accessorKey: "priority",
        header: ({ column }) => <SortBtn column={column} label="Priority" />,
        cell: ({ row }) => <PriorityChip priority={row.original.priority} />,
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
        cell: ({ row }) => {
          const rel = getRelativeTime(row.original.updated_at);
          return (
            <div className="flex flex-col">
              <span className="whitespace-nowrap text-xs font-semibold text-slate-800 dark:text-slate-200">
                {formatDate(row.original.updated_at)}
              </span>
              {rel && (
                <span className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5">
                  {rel}
                </span>
              )}
            </div>
          );
        },
        size: 110,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const handleViewDetails = (e: React.MouseEvent) => {
            e.preventDefault();
            if (typeof document !== "undefined" && (document as any).startViewTransition) {
              (document as any).startViewTransition(() => {
                router.push(`/rti/${row.original.id}`);
              });
            } else {
              router.push(`/rti/${row.original.id}`);
            }
          };

          return (
            <div className="flex justify-end pr-2">
              <Button
                variant="default"
                size="sm"
                className="h-8 px-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground transition-all duration-150 shadow-xs"
                onClick={handleViewDetails}
              >
                View
              </Button>
            </div>
          );
        },
        size: 70,
        enableSorting: false,
      },
    ],
    [rules, router],
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
      const hay = [r.internal_ref, r.subject, r.category, r.public_authority, r.pio_name, r.job_number]
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

  // Calculate row counts for pagination
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = filtered.length;
  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, totalRows);
  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── DESKTOP TOOLBAR (md and up) ── */}
      <div className="hidden md:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print bg-slate-55 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-405 shrink-0" />
            <Input
              placeholder="Search ref, subject, authority…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 w-64 text-sm pl-9 bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
            />
          </div>
          <select
            className={selectCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Status filter"
          >
            <option value="all">Any status</option>
            {RTI_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category filter"
          >
            <option value="all">Any category</option>
            {RTI_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label="Priority filter"
          >
            <option value="all">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label="Deadline filter"
          >
            {DEADLINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-9 px-2.5 text-xs text-slate-500 hover:text-foreground cursor-pointer"
            >
              <X className="h-4 w-4 mr-1.5" /> Reset
            </Button>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-505 ml-2 font-medium">
            Showing {filtered.length} RTIs
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("csv")}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("xlsx")}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <Download className="h-4 w-4 mr-1.5" /> XLSX
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── MOBILE TOOLBAR (md hidden) ── */}
      <div className="flex md:hidden flex-col gap-2.5 no-print bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-3xs">
        {/* Full-width Search Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400 shrink-0 pointer-events-none" />
          <Input
            placeholder="Search ref, subject, authority…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-11 w-full text-sm pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
            aria-label="Search cases"
          />
        </div>

        {/* Toolbar buttons row */}
        <div className="flex items-center gap-2 w-full">
          {/* Filters toggle */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={cn(
              "h-11 flex-1 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 cursor-pointer transition-all bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800",
              showMobileFilters && "bg-slate-100 border-slate-300 dark:bg-slate-850 dark:border-slate-700"
            )}
            aria-label="Toggle advanced filters"
          >
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
            <span>Filters</span>
            {hasFilters && (
              <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
            )}
          </Button>

          {/* Export Select Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-11 flex-1 text-xs font-bold rounded-lg border flex items-center justify-center gap-2 cursor-pointer bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                aria-label="Export cases"
              >
                <Download className="h-4 w-4 text-slate-500" />
                <span>Export</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
              <DropdownMenuItem onClick={() => doExport("csv")} className="cursor-pointer text-xs font-semibold">
                Export to CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("xlsx")} className="cursor-pointer text-xs font-semibold">
                Export to Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh button */}
          <Button
            variant="outline"
            onClick={() => router.refresh()}
            className="h-11 w-11 shrink-0 rounded-lg border flex items-center justify-center cursor-pointer bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>

        {/* Collapsible advanced filters accordion grid */}
        <AnimatePresence initial={false}>
          {showMobileFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden border-t border-slate-100 dark:border-slate-800/80 pt-2.5 mt-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wider pl-0.5">Status</span>
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-55 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 w-full cursor-pointer"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Status filter option"
                  >
                    <option value="all">Any status</option>
                    {RTI_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wider pl-0.5">Category</span>
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-55 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 w-full cursor-pointer"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label="Category filter option"
                  >
                    <option value="all">Any category</option>
                    {RTI_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wider pl-0.5">Priority</span>
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-55 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 w-full cursor-pointer"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    aria-label="Priority filter option"
                  >
                    <option value="all">Any priority</option>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wider pl-0.5">Deadline</span>
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-55 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 w-full cursor-pointer"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    aria-label="Deadline filter option"
                  >
                    {DEADLINE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="h-10 mt-3 w-full text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-250 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <X className="h-4 w-4" /> Reset Filters
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop & Tablet Table Layout */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:bg-slate-900 dark:border-slate-800">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <Table className="w-full text-left border-collapse">
            <TableHeader className="sticky top-0 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md border-b-2 border-slate-200/80 dark:border-slate-800 z-10 shadow-2xs">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent border-none">
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400 py-3.5"
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
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
                    className="h-[72px] odd:bg-white dark:odd:bg-slate-900/40 even:bg-slate-50/5 dark:even:bg-slate-950/15 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-150 ease-out border-b border-slate-200/60 dark:border-slate-800/50 hover:shadow-3xs"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card Layout */}
      <div className="block md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground dark:bg-slate-900/40 dark:border-slate-800 select-none">
            No RTIs match these filters.
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const r = row.original;
            return (
              <Card
                key={r.id}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs rounded-xl overflow-hidden hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-200 select-none animate-in fade-in slide-in-from-bottom-1 duration-150"
              >
                <CardContent className="p-3.5 space-y-2.5">
                  {/* Row 1: Status & Priority badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <RtiStatusBadge status={r.status} />
                    <PriorityChip priority={r.priority} />
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-auto">
                      {getWorkflowStage(r.status)}
                    </span>
                  </div>

                  {/* Row 2: Ref & Date */}
                  <div className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-800/80 pb-2">
                    <span className="font-mono font-bold text-slate-850 dark:text-slate-200">
                      {orDash(r.internal_ref, "Pending")}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                      {formatDate(r.created_at)}
                    </span>
                  </div>

                  {/* Row 3: Subject Title */}
                  <h3 className="font-bold text-[15px] sm:text-base text-slate-855 dark:text-slate-200 line-clamp-2 leading-relaxed">
                    {r.subject}
                  </h3>

                  {/* Row 4: Category & Deadline */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                    <CategoryChip category={r.category} />
                    <DeadlineBadge rti={r} rules={rules} />
                  </div>

                  {/* Row 5: View Details button */}
                  <Button
                    asChild
                    variant="default"
                    className="w-full h-11 justify-center mt-2.5 font-bold hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer text-xs uppercase tracking-wide"
                  >
                    <Link href={`/rti/${r.id}`}>
                      View Details
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop Pagination & Footer */}
      <div className="hidden md:flex mt-3 items-center justify-between text-sm text-slate-500 dark:text-slate-455 no-print select-none">
        <span className="font-medium">
          Showing {fromRow}–{toRow} of {totalRows} RTIs
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Previous
          </Button>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-750">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Mobile Pagination & Footer */}
      <div className="flex md:hidden flex-col items-center gap-3 mt-4 text-sm text-slate-500 dark:text-slate-455 no-print select-none w-full border-t border-slate-100 dark:border-slate-800/80 pt-3">
        <span className="font-semibold text-xs text-slate-400 dark:text-slate-505">
          Showing {fromRow}–{toRow} of {totalRows} RTIs
        </span>
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-11 flex-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer bg-white"
            >
              Previous
            </Button>
            <span className="text-xs font-semibold px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-750 shrink-0">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-11 flex-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer bg-white"
            >
              Next
            </Button>
          </div>
        )}
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
      className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60 ml-0.5" />
    </button>
  );
}
