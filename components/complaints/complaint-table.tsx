"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown, Download, ChevronLeft, ChevronRight, X, Search, RefreshCw, ArrowRight,
  Folder, Construction, Droplet, Trash2, Lightbulb, Briefcase, Minus, ArrowUp, ArrowDown,
  AlertTriangle, CheckCircle2, LucideIcon, MoreVertical, ChevronDown, ChevronUp
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/complaints/status-badge";
import { ViewButton } from "@/components/complaints/view-button";
import { COMPLAINT_TYPES, COMPLAINT_STATUSES, PRIORITIES } from "@/lib/constants";
import { formatDate, orDash } from "@/lib/format";
import { exportRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { ComplaintWithRelations } from "@/lib/types";

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-855 dark:focus:ring-slate-800 cursor-pointer";

const today = new Date().toISOString().slice(0, 10);

function getRelativeTime(dateInput: string | Date | null | undefined): string {
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

function getNextActionForStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === "draft") return "NEXT: FILE COMPLAINT";
  if (s === "filed") return "NEXT: ACKNOWLEDGEMENT";
  if (s === "acknowledged" || s.includes("review") || s.includes("assigned") || s.includes("site visit") || s.includes("work in progress")) {
    return "NEXT: REPLY / ATR";
  }
  if (s.includes("reply") || s.includes("action taken") || s === "reopened") {
    return "NEXT: RESOLUTION / ESCALATE";
  }
  if (s === "resolved" || s === "closed") {
    return "CASE CLOSED";
  }
  if (s === "escalated") return "NEXT: SENIOR OFFICER REPLY";
  if (s.includes("rti")) return "NEXT: RTI REPLY";
  return "NEXT: REVIEW";
}

function TypeChip({ type }: { type: string | null }) {
  if (!type) return orDash(type);

  let Icon = Folder;
  switch (type) {
    case "Road":
    case "Footpath":
    case "Public Works":
      Icon = Construction;
      break;
    case "Drain":
    case "Water Logging":
      Icon = Droplet;
      break;
    case "Garbage":
    case "Health Issue":
      Icon = Trash2;
      break;
    case "Streetlight":
      Icon = Lightbulb;
      break;
    case "Tender Irregularity":
    case "Bill Payment":
    case "Contractor Issue":
      Icon = Briefcase;
      break;
    default:
      Icon = Folder;
  }

  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 h-6 rounded-md border-slate-200 bg-slate-55 text-slate-700 font-medium text-xs dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-300"
    >
      <Icon className="h-3.5 w-3.5 text-slate-405 shrink-0" />
      {type}
    </Badge>
  );
}

function PriorityChip({ priority }: { priority: string | null }) {
  if (!priority) return orDash(priority);

  let Icon = Minus;
  let cls = "";

  switch (priority) {
    case "Urgent":
      Icon = AlertTriangle;
      cls =
        "border-rose-200 bg-rose-50/70 text-rose-800 dark:bg-rose-955/20 dark:border-rose-900 dark:text-rose-450";
      break;
    case "High":
      Icon = ArrowUp;
      cls =
        "border-amber-200 bg-amber-50/70 text-amber-800 dark:bg-amber-955/20 dark:border-amber-900 dark:text-amber-400";
      break;
    case "Medium":
      Icon = Minus;
      cls =
        "border-blue-200 bg-blue-50/70 text-blue-800 dark:bg-blue-955/20 dark:border-blue-900 dark:text-blue-400";
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

function FollowUpDeadlineBadge({
  date,
  status
}: {
  date: string | Date | null | undefined;
  status: string;
}) {
  if (status === "Closed" || status === "Resolved") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-55/40 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Closed
      </div>
    );
  }

  if (!date) {
    return <span className="text-xs text-slate-400 italic font-medium">Pending</span>;
  }

  const d = typeof date === "string" ? new Date(date) : new Date(date);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffMs = d.getTime() - todayDate.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const isOverdue = days < 0;
  const absDays = Math.abs(days);

  let variant: "success" | "warning" | "destructive" | "info" = "info";
  if (isOverdue) {
    variant = "destructive";
  } else if (days <= 7) {
    variant = "warning";
  } else if (days > 15) {
    variant = "success";
  }

  const text = isOverdue ? "Days Overdue" : days === 1 ? "Day Left" : "Days Left";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border p-1 px-2.5 shadow-xs transition-all duration-200",
        variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/20 dark:bg-emerald-950/30 dark:text-emerald-400",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/30 dark:text-amber-400",
        variant === "destructive" &&
          "border-rose-200 bg-rose-55 text-rose-800 dark:border-rose-900/20 dark:bg-rose-955/30 dark:text-rose-400",
        variant === "info" &&
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/20 dark:bg-blue-955/30 dark:text-blue-450",
      )}
    >
      {isOverdue && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-extrabold tracking-tight dark:text-white">{absDays}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">{text}</span>
        </div>
        <span className="text-[8px] font-bold opacity-80 mt-0.5 tracking-wider uppercase">
          Follow-up
        </span>
      </div>
    </div>
  );
}

function ComplaintCard({ c, router }: { c: ComplaintWithRelations; router: any }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Card className="border border-slate-200 bg-white shadow-xs rounded-xl overflow-hidden hover:border-blue-200 dark:bg-slate-900/40 dark:border-slate-800 transition-all duration-205 group">
      <CardContent className="p-3.5 space-y-3">
        {/* Header: Complaint ID & Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-slate-850 dark:text-slate-200">
              {c.internal_case_number || "Pending"}
            </span>
            <span className="text-[10px] text-slate-450 dark:text-slate-500 mt-0.5">
              {formatDate(c.date_submitted)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={c.status} date={c.updated_at} />
            <PriorityChip priority={c.priority} />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-slate-850 dark:text-slate-200 line-clamp-2 leading-relaxed">
            {c.title}
          </h3>
        </div>

        {/* Secondary Details (Collapsible on Mobile) */}
        {expanded && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-850 text-xs text-slate-655 dark:text-slate-400">
            <div>
              <span className="font-semibold text-slate-500 mr-1.5">Ward:</span>
              <span>{c.ward ? `Ward ${c.ward.new_no} · ${c.ward.new_name}` : "—"}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 mr-1.5">Engineer:</span>
              <span>{c.assigned_engineer?.full_name ?? "—"}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-500 mr-1.5">Division:</span>
              <span>{c.division?.name ?? "—"}</span>
            </div>
            {c.eng_subdivision && (
              <div>
                <span className="font-semibold text-slate-500 mr-1.5">Sub-division:</span>
                <span>{c.eng_subdivision.name}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions & Expander Trigger */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 mt-1.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs font-semibold text-slate-550 hover:text-slate-700 flex items-center gap-1 cursor-pointer h-9 px-2 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50/50 dark:bg-slate-900"
            >
              {expanded ? "Less" : "Details"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <FollowUpDeadlineBadge date={c.next_follow_up_date} status={c.status} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold cursor-pointer border dark:border-slate-800 px-2"
            >
              <Link href={`/complaints/${c.id}`}>
                View Details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg cursor-pointer flex items-center justify-center">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                <DropdownMenuItem asChild className="cursor-pointer text-xs">
                  <Link href={`/complaints/${c.id}/edit`}>Edit</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer text-xs">
                  <Link href={`/complaints/${c.id}/escalation`}>Assign / Escalate</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer text-xs">
                  <Link href={`/complaints/${c.id}`}>History</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer text-xs">
                  <Link href={`/complaints/${c.id}/print`}>Print</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ComplaintTable({ data }: { data: ComplaintWithRelations[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  // Initial status/flag come from the URL so dashboard cards can deep-link to a
  // pre-filtered worklist (e.g. /complaints?flag=overdue, ?status=Escalated).
  const [status, setStatus] = React.useState(() => searchParams.get("status") ?? "all");
  const [type, setType] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [flag, setFlag] = React.useState(() => searchParams.get("flag") ?? "all"); // overdue | reply | action | noreply | today | open
  const [division, setDivision] = React.useState("all");
  const [subDivision, setSubDivision] = React.useState("all");
  const [ward, setWard] = React.useState("all");

  const divisionOpts = React.useMemo(
    () => [...new Set(data.map((c) => c.division?.name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const subDivisionOpts = React.useMemo(
    () => [...new Set(data.map((c) => c.eng_subdivision?.name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [data],
  );
  const wardOpts = React.useMemo(
    () => [...new Set(data.map((c) => (c.ward ? String(c.ward.new_no) : null)).filter(Boolean) as string[])].sort((a, b) => Number(a) - Number(b)),
    [data],
  );

  const filtered = React.useMemo(
    () => data.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (type !== "all" && c.type !== type) return false;
      if (priority !== "all" && c.priority !== priority) return false;
      if (division !== "all" && c.division?.name !== division) return false;
      if (subDivision !== "all" && c.eng_subdivision?.name !== subDivision) return false;
      if (ward !== "all" && String(c.ward?.new_no ?? "") !== ward) return false;
      if (flag === "overdue" && !(c.next_follow_up_date && c.next_follow_up_date < today)) return false;
      if (flag === "reply" && !c.latest_reply_date) return false;
      if (flag === "action" && !c.latest_action_taken_date) return false;
      if (flag === "noreply" && c.latest_reply_date) return false;
      if (flag === "today" && c.next_follow_up_date !== today) return false;
      if (flag === "open" && (c.status === "Resolved" || c.status === "Closed")) return false;
      return true;
    }),
    [data, status, type, priority, flag, division, subDivision, ward],
  );

  const hasFilters = globalFilter !== "" || status !== "all" || type !== "all" || priority !== "all" || flag !== "all" || division !== "all" || subDivision !== "all" || ward !== "all";
  
  const reset = () => {
    setGlobalFilter("");
    setStatus("all");
    setType("all");
    setPriority("all");
    setFlag("all");
    setDivision("all");
    setSubDivision("all");
    setWard("all");
  };

  const columns = React.useMemo<ColumnDef<ComplaintWithRelations>[]>(() => [
    {
      accessorKey: "internal_case_number",
      header: ({ column }) => <SortBtn column={column} label="Ref" />,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.internal_case_number || "Pending"}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            {formatDate(row.original.date_submitted)}
          </span>
        </div>
      ),
      size: 110
    },
    {
      accessorKey: "title",
      header: ({ column }) => <SortBtn column={column} label="Subject" />,
      cell: ({ row }) => {
        const c = row.original;
        const subtext = [
          c.internal_case_number,
          c.ward ? `Ward ${c.ward.new_no}` : null,
          c.date_submitted ? `Created: ${formatDate(c.date_submitted)}` : null
        ].filter(Boolean).join(" • ");

        return (
          <div className="flex flex-col py-1">
            <span className="font-bold text-sm text-slate-850 dark:text-slate-200 line-clamp-2 max-w-md leading-relaxed">
              {c.title}
            </span>
            <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              <span>{subtext}</span>
            </div>
          </div>
        );
      }
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status} date={row.original.updated_at} />
          <span className="text-[10px] font-bold text-slate-455 dark:text-slate-500 uppercase tracking-wider pl-0.5">
            {getNextActionForStatus(row.original.status)}
          </span>
        </div>
      ),
      size: 140
    },
    {
      accessorKey: "type",
      header: "Category",
      cell: ({ row }) => <TypeChip type={row.original.type} />
    },
    {
      accessorKey: "priority",
      header: ({ column }) => <SortBtn column={column} label="Priority" />,
      cell: ({ row }) => <PriorityChip priority={row.original.priority} />,
      size: 90
    },
    {
      id: "deadline",
      header: "Deadline",
      cell: ({ row }) => <FollowUpDeadlineBadge date={row.original.next_follow_up_date} status={row.original.status} />,
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
      cell: ({ row }) => (
        <div className="flex justify-end pr-2">
          <ViewButton href={`/complaints/${row.original.id}`} caseNumber={row.original.internal_case_number ?? "Complaint"} />
        </div>
      ),
      size: 70,
      enableSorting: false,
    },
  ], []);

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
    globalFilterFn: (row, _c, value) => {
      const r = row.original;
      const hay = [
        r.internal_case_number,
        r.complaint_number,
        r.title,
        r.location,
        r.assigned_engineer?.full_name,
        r.latest_reply_summary,
        r.latest_action_taken_summary
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(String(value).toLowerCase());
    },
    initialState: { pagination: { pageSize: 25 } },
  });

  function doExport(format: "csv" | "xlsx") {
    exportRows(filtered.map((c) => ({
      case_no: c.internal_case_number ?? "",
      external_no: c.complaint_number ?? "",
      title: c.title,
      type: c.type,
      ward: c.ward ? `${c.ward.new_no} ${c.ward.new_name}` : "",
      division: c.division?.name ?? "",
      sub_division: c.eng_subdivision?.name ?? "",
      engineer: c.assigned_engineer?.full_name ?? "",
      given: c.date_submitted ?? "",
      latest_reply: c.latest_reply_date ?? "",
      latest_action: c.latest_action_taken_date ?? "",
      status: c.status,
      priority: c.priority ?? "",
      next_follow_up: c.next_follow_up_date ?? "",
    })), "complaint-tracker", format);
  }

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = filtered.length;
  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Responsive Toolbar */}
      
      {/* 1. Desktop & Tablet Toolbar Layout (Unchanged) */}
      <div className="hidden md:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print bg-slate-55 dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-405 shrink-0" />
            <Input
              placeholder="Search case no, title, OCR…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 w-64 text-sm pl-9 bg-white dark:bg-slate-955/40 border-slate-200 dark:border-slate-800"
            />
          </div>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
            <option value="all">Any status</option>
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
            <option value="all">Any type</option>
            {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority filter">
            <option value="all">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className={selectCls} value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Quick flag filter">
            <option value="all">All</option>
            <option value="open">Open (not resolved)</option>
            <option value="today">Follow-up due today</option>
            <option value="overdue">Overdue follow-up</option>
            <option value="reply">Reply received</option>
            <option value="action">Action taken</option>
            <option value="noreply">No reply</option>
          </select>
          {divisionOpts.length > 0 && (
            <select className={selectCls} value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division filter">
              <option value="all">Any division</option>
              {divisionOpts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {subDivisionOpts.length > 0 && (
            <select className={selectCls} value={subDivision} onChange={(e) => setSubDivision(e.target.value)} aria-label="Sub-division filter">
              <option value="all">Any sub-division</option>
              {subDivisionOpts.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {wardOpts.length > 0 && (
            <select className={selectCls} value={ward} onChange={(e) => setWard(e.target.value)} aria-label="Ward filter">
              <option value="all">Any ward</option>
              {wardOpts.map((w) => <option key={w} value={w}>Ward {w}</option>)}
            </select>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={reset} className="h-9 px-2.5 text-xs text-slate-500 hover:text-foreground">
              <X className="h-4 w-4 mr-1.5" /> Reset
            </Button>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-550 ml-2 font-medium">
            Showing {filtered.length} complaints
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("csv")}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg"
          >
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => doExport("xlsx")}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg"
          >
            <Download className="h-4 w-4 mr-1.5" /> XLSX
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg"
            aria-label="Refresh data"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* 2. Mobile Toolbar Layout: Search Complains Field + Collapsible Filters Panel */}
      <div className="md:hidden space-y-2.5 no-print">
        {/* Sticky Search bar & Quick buttons */}
        <div className="sticky top-14 z-20 flex flex-col gap-2 p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400 shrink-0" />
            <Input
              placeholder="Search Complaint..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-11 pl-10 text-sm bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-800"
            />
          </div>
          <div className="flex items-center gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="flex-1 h-11 text-xs font-semibold gap-1.5 cursor-pointer justify-center rounded-lg border-slate-200 dark:border-slate-800 dark:bg-slate-900"
            >
              <span>Advanced Filters</span>
              {hasFilters && <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-450 shrink-0" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              className="h-11 w-11 p-0 cursor-pointer justify-center shrink-0 rounded-lg border-slate-200 dark:border-slate-800 dark:bg-slate-900"
              aria-label="Refresh data"
            >
              <RefreshCw className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        </div>

        {/* Collapsible Select options Panel */}
        {showMobileFilters && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-accordion-down">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Status</span>
              <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Any Status</option>
                {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Category</span>
              <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="all">Any Category</option>
                {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Priority</span>
              <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="all">Any Priority</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Quick Flag</span>
              <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={flag} onChange={(e) => setFlag(e.target.value)}>
                <option value="all">All Flags</option>
                <option value="open">Open (not resolved)</option>
                <option value="today">Follow-up due today</option>
                <option value="overdue">Overdue follow-up</option>
                <option value="reply">Reply received</option>
                <option value="action">Action taken</option>
                <option value="noreply">No reply</option>
              </select>
            </div>

            {divisionOpts.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Division</span>
                <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={division} onChange={(e) => setDivision(e.target.value)}>
                  <option value="all">Any Division</option>
                  {divisionOpts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {subDivisionOpts.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-wider pl-0.5">Sub-division</span>
                <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={subDivision} onChange={(e) => setSubDivision(e.target.value)}>
                  <option value="all">Any Sub-division</option>
                  {subDivisionOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {wardOpts.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-455 dark:text-slate-400 uppercase tracking-wider pl-0.5">Ward</span>
                <select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" value={ward} onChange={(e) => setWard(e.target.value)}>
                  <option value="all">Any Ward</option>
                  {wardOpts.map((w) => <option key={w} value={w}>Ward {w}</option>)}
                </select>
              </div>
            )}

            <div className="flex items-end justify-between gap-3 pt-3 sm:col-span-2 border-t border-slate-200/50 dark:border-slate-800/80">
              <span className="text-xs text-slate-450 dark:text-slate-500 font-semibold self-center">
                Showing {filtered.length} complaints
              </span>
              <div className="flex gap-2">
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={reset} className="h-9 px-3 text-xs text-rose-500 hover:text-rose-600 font-bold border rounded-md bg-white dark:bg-slate-900 dark:border-slate-800">
                    Reset
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setShowMobileFilters(false)} className="h-9 px-4 text-xs font-bold justify-center cursor-pointer">
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop & Tablet Table Layout */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:bg-slate-900 dark:border-slate-800 animate-page-slide">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
          <Table className="w-full text-left border-collapse">
            <TableHeader className="sticky top-0 bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-md border-b-2 border-slate-200/80 dark:border-slate-800 z-10 shadow-2xs">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent border-none">
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400 py-3.5 px-4"
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground py-3 px-4">
                    No complaints match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="h-[72px] odd:bg-white dark:odd:bg-slate-900/40 even:bg-slate-50/5 dark:even:bg-slate-950/15 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-150 ease-out border-b border-slate-200/60 dark:border-slate-800/50 hover:shadow-3xs"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle py-3 px-4">
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
      <div className="block md:hidden space-y-3.5">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-455 dark:bg-slate-900/40 dark:border-slate-800">
            No complaints match these filters.
          </div>
        ) : (
          table.getRowModel().rows.map((row) => (
            <ComplaintCard key={row.original.id} c={row.original} router={router} />
          ))
        )}
      </div>

      {/* Pagination & Footer */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-505 dark:text-slate-455 no-print border-t border-slate-100 dark:border-slate-850 pt-4">
        <span className="font-semibold text-center sm:text-left text-xs">
          Showing {fromRow}–{toRow} of {totalRows} complaints
        </span>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-11 sm:h-8 px-4 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Previous
          </Button>
          <span className="text-xs font-bold px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-750">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-11 sm:h-8 px-4 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Next
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
      className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60 ml-0.5" />
    </button>
  );
}
