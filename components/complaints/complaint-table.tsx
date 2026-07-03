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
  AlertTriangle, CheckCircle2, LucideIcon, MoreVertical, ChevronDown, ChevronUp,
  Sparkles, Clock, Printer, ShieldAlert, BarChart3, Database, FileText, Check, Plus,
  LayoutDashboard, Smartphone, Upload, Eye, CheckSquare, Square, Trash, Settings,
  Activity, TrendingUp, TrendingDown, User, Mail, History as HistoryIcon
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
import { COMPLAINT_TYPES, COMPLAINT_STATUSES, PRIORITIES, COMPLAINT_OPEN_STATUSES } from "@/lib/constants";
import { formatDate, orDash } from "@/lib/format";
import { exportRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { ComplaintWithRelations } from "@/lib/types";

const selectCls =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:focus:ring-slate-800 cursor-pointer";

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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap rounded-md border-slate-200 bg-slate-50 text-slate-700 font-medium text-xs dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-300 animate-fade-in"
    >
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 h-6 rounded-md font-semibold text-xs border animate-fade-in", cls)}
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
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/40 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
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

  const text = isOverdue ? "Overdue" : days === 1 ? "Day Left" : "Days Left";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border p-1 px-2.5 shadow-xs transition-all duration-200",
        variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/20 dark:bg-emerald-950/30 dark:text-emerald-400",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/30 dark:text-amber-400",
        variant === "destructive" &&
          "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/20 dark:bg-rose-950/30 dark:text-rose-400",
        variant === "info" &&
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/20 dark:bg-blue-950/30 dark:text-blue-400",
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

const AnimatedNumber = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }
    const duration = 650; // ms
    const startTime = performance.now();

    const updateNumber = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = progress * (2 - progress); // easeOutQuad
      const current = Math.floor(easeProgress * (end - start) + start);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateNumber);
      } else {
        setDisplayValue(end);
      }
    };

    requestAnimationFrame(updateNumber);
  }, [value]);

  return <span>{displayValue.toLocaleString()}</span>;
};

function ComplaintCard({ c, router }: { c: ComplaintWithRelations; router: any }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Card className="border border-slate-200 bg-white shadow-xs rounded-xl overflow-hidden hover:border-blue-200 dark:bg-slate-900/40 dark:border-slate-800 transition-all duration-205 group animate-fade-in">
      <CardContent className="p-3.5 space-y-3">
        {/* Header: Complaint ID & Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
              {c.internal_case_number || "Pending"}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
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
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">
            {c.title}
          </h3>
        </div>

        {/* Secondary Details (Collapsible on Mobile) */}
        {expanded && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-400">
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
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer h-9 px-2 border border-slate-200 dark:border-slate-800 rounded-md bg-slate-50/50 dark:bg-slate-900"
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

export function ComplaintTable({ data, canEdit = false }: { data: ComplaintWithRelations[]; canEdit?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "updated_at", desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  
  // URL bound filters
  const [status, setStatus] = React.useState(() => searchParams.get("status") ?? "all");
  const [type, setType] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [flag, setFlag] = React.useState(() => searchParams.get("flag") ?? "all");
  const [division, setDivision] = React.useState(() => searchParams.get("division") ?? "all");
  const [subDivision, setSubDivision] = React.useState(() => searchParams.get("subDivision") ?? "all");
  const [ward, setWard] = React.useState(() => searchParams.get("ward") ?? "all");

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
    setSelectedIds([]);
  };

  // Pre-calculated stats for KPIs
  const totalCount = data.length;
  const openCount = data.filter((c) => c.status !== "Resolved" && c.status !== "Closed").length;
  const awaitingReplyCount = data.filter((c) => ["Acknowledged", "Under Review", "Assigned To Engineer", "Site Visit Pending", "Site Visit Done", "Work In Progress"].includes(c.status)).length;
  const overdueCount = data.filter((c) => c.next_follow_up_date && c.next_follow_up_date < today && c.status !== "Resolved" && c.status !== "Closed").length;
  const resolvedCount = data.filter((c) => c.status === "Resolved" || c.status === "Closed").length;
  const printQueueCount = data.filter((c) => c.status === "Draft").length;
  const aiReviewPendingCount = data.filter((c) => c.status === "Filed").length;

  // Intelligence banner AI recommendation helper
  const topDivision = React.useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((c) => {
      const name = c.division?.name;
      if (name) counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Bengaluru Central";
  }, [data]);

  const aiRecommendation = `Most complaints originate from ${topDivision}. Recommend allocating 2 additional field supervisors for accelerated resolutions.`;

  // Activity timeline dynamic data
  const recentActivities = React.useMemo(() => {
    return [...data]
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 5)
      .map((c) => {
        let label = "Details Updated";
        let color = "text-slate-600 bg-slate-100 dark:bg-slate-800";
        let IconCls: React.ComponentType<any> = HistoryIcon;

        if (c.status === "Draft" || c.status === "Filed") {
          label = "Complaint Intake Filed";
          color = "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30";
          IconCls = Plus;
        } else if (c.status === "Resolved" || c.status === "Closed") {
          label = "Complaint Resolved";
          color = "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30";
          IconCls = CheckCircle2;
        } else if (c.status.includes("Reply")) {
          label = "Reply Received";
          color = "text-amber-600 bg-amber-50 dark:bg-amber-950/30";
          IconCls = Mail;
        } else if (c.status.includes("Action")) {
          label = "Action Taken Recorded";
          color = "text-teal bg-teal/10";
          IconCls = Sparkles;
        }

        return {
          id: c.id,
          ref: c.internal_case_number || "Pending",
          title: c.title,
          label,
          time: getRelativeTime(c.updated_at),
          color,
          IconCls,
        };
      });
  }, [data]);

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
      size: 115
    },
    {
      accessorKey: "title",
      header: ({ column }) => <SortBtn column={column} label="Subject" />,
      cell: ({ row }) => {
        const c = row.original;
        const subtext = [
          c.ward ? `Ward ${c.ward.new_no} · ${c.ward.new_name}` : null,
          c.division ? c.division.name : null,
          c.eng_subdivision ? c.eng_subdivision.name : null
        ].filter(Boolean).join(" • ");

        return (
          <div className="flex flex-col py-1">
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200 line-clamp-2 max-w-md leading-relaxed group-hover:text-primary transition-colors">
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
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider pl-0.5">
            {getNextActionForStatus(row.original.status)}
          </span>
        </div>
      ),
      size: 145
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
      size: 95
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
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
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
  ], [selectedIds, filtered]);

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

  // Removable filters calculation
  const activeFiltersList = React.useMemo(() => {
    const list = [];
    if (globalFilter) list.push({ key: "search", label: `Search: "${globalFilter}"`, reset: () => setGlobalFilter("") });
    if (status !== "all") list.push({ key: "status", label: `Status: ${status}`, reset: () => setStatus("all") });
    if (type !== "all") list.push({ key: "type", label: `Type: ${type}`, reset: () => setType("all") });
    if (priority !== "all") list.push({ key: "priority", label: `Priority: ${priority}`, reset: () => setPriority("all") });
    if (flag !== "all") {
      let label = `Flag: ${flag}`;
      if (flag === "open") label = "Flag: Open Cases";
      if (flag === "today") label = "Flag: Due Today";
      if (flag === "overdue") label = "Flag: Overdue";
      if (flag === "reply") label = "Flag: Reply Received";
      if (flag === "action") label = "Flag: Action Taken";
      if (flag === "noreply") label = "Flag: No Reply";
      list.push({ key: "flag", label, reset: () => setFlag("all") });
    }
    if (division !== "all") list.push({ key: "division", label: `Division: ${division}`, reset: () => setDivision("all") });
    if (subDivision !== "all") list.push({ key: "subDivision", label: `Sub-division: ${subDivision}`, reset: () => setSubDivision("all") });
    if (ward !== "all") list.push({ key: "ward", label: `Ward: ${ward}`, reset: () => setWard("all") });
    return list;
  }, [globalFilter, status, type, priority, flag, division, subDivision, ward]);

  // Sidebar triggers mapping to set corresponding filter states
  const applyQuickFilter = (typeStr: string) => {
    reset();
    if (typeStr === "overdue") setFlag("overdue");
    else if (typeStr === "reply") setFlag("reply");
    else if (typeStr === "high") setPriority("High");
    else if (typeStr === "urgent") setPriority("Urgent");
    else if (typeStr === "draft") setStatus("Draft");
    else if (typeStr === "today") setFlag("today");
    else if (typeStr === "open") setFlag("open");
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium no-print">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/45" />
        <span className="text-foreground font-semibold">Complaints</span>
      </nav>

      {/* Modern Large Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5 no-print">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-none">
            Complaint Tracker
          </h1>
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-muted-foreground/95 font-medium">
            Every civic complaint with internal case number, replies, action taken, documents (OCR/AI), and follow-up reminders.
          </p>
        </div>

        {/* Primary Action Bar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer">
            <Link href="/complaints/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1.5" /> Dashboard
            </Link>
          </Button>

          <Button asChild size="sm" variant="outline" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer">
            <Link href="/complaints/reports">
              <BarChart3 className="h-4 w-4 mr-1.5" /> Reports
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer">
                <Download className="h-4 w-4 mr-1.5" /> Export <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
              <DropdownMenuItem onClick={() => doExport("csv")} className="cursor-pointer text-xs flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("xlsx")} className="cursor-pointer text-xs flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> Export Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {canEdit && (
            <>
              <Button asChild size="sm" variant="outline" className="h-9 font-semibold hover:scale-[1.01] transition-all cursor-pointer">
                <Link href="/complaints/import">
                  <Upload className="h-4 w-4 mr-1.5" /> Upload ZIP
                </Link>
              </Button>

              <Button asChild size="sm" className="h-9 font-semibold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm">
                <Link href="/complaints/new">
                  <Plus className="h-4 w-4 mr-1" /> New Complaint
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Executive KPI Grid Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 no-print">
        <KpiCard
          label="Total complaints"
          value={totalCount}
          icon={Database}
          colorClass="text-slate-600 bg-slate-50 dark:bg-slate-800/40"
          sparkline={
            <svg className="h-5 w-16 text-slate-400" viewBox="0 0 100 30">
              <path d="M0,25 Q15,10 30,22 T60,5 T90,20 T100,12" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-slate-500">
              <Clock className="h-3 w-3" /> Live
            </div>
          }
        />
        <KpiCard
          label="Open"
          value={openCount}
          icon={Activity}
          colorClass="text-blue-600 bg-blue-50 dark:bg-blue-950/20"
          sparkline={
            <svg className="h-5 w-16 text-blue-500" viewBox="0 0 100 30">
              <path d="M0,20 Q15,28 30,12 T60,25 T90,8 T100,5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-3 w-3" /> Active
            </div>
          }
        />
        <KpiCard
          label="Awaiting Reply"
          value={awaitingReplyCount}
          icon={MailIconPlaceholder}
          colorClass="text-amber-600 bg-amber-50 dark:bg-amber-950/20"
          sparkline={
            <svg className="h-5 w-16 text-amber-500" viewBox="0 0 100 30">
              <path d="M0,22 Q15,15 30,25 T60,18 T90,12 T100,20" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <TrendingDown className="h-3 w-3" /> In progress
            </div>
          }
        />
        <KpiCard
          label="Overdue Follow-up"
          value={overdueCount}
          icon={ShieldAlert}
          colorClass="text-rose-600 bg-rose-50 dark:bg-rose-950/20"
          sparkline={
            <svg className="h-5 w-16 text-rose-500" viewBox="0 0 100 30">
              <path d="M0,5 Q15,18 30,12 T60,28 T90,15 T100,25" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3" /> Action required
            </div>
          }
        />
        <KpiCard
          label="Resolved / Closed"
          value={resolvedCount}
          icon={CheckCircle2}
          colorClass="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
          sparkline={
            <svg className="h-5 w-16 text-emerald-500" viewBox="0 0 100 30">
              <path d="M0,28 Q15,22 30,25 T60,12 T90,5 T100,2" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Completed
            </div>
          }
        />
        <KpiCard
          label="Printing queue"
          value={printQueueCount}
          icon={Printer}
          colorClass="text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20"
          sparkline={
            <svg className="h-5 w-16 text-indigo-500" viewBox="0 0 100 30">
              <path d="M0,25 Q15,12 30,20 T60,10 T90,18 T100,14" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
              <Clock className="h-3 w-3" /> Draft stage
            </div>
          }
        />
        <KpiCard
          label="AI Review Pending"
          value={aiReviewPendingCount}
          icon={Sparkles}
          colorClass="text-teal bg-teal/10"
          sparkline={
            <svg className="h-5 w-16 text-teal-600 dark:text-teal-400" viewBox="0 0 100 30">
              <path d="M0,20 Q15,8 30,15 T60,5 T90,22 T100,10" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          trend={
            <div className="flex items-center gap-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400 animate-pulse">
              <Sparkles className="h-3 w-3" /> OCR processing
            </div>
          }
        />
      </div>

      {/* Main Workspace Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Side: Filter Workspace + Table Grid */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Enterprise Unified Filter Workspace */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-border/80 space-y-3 shadow-2xs no-print">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  placeholder="Search case no, title, OCR..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-9 pl-9 bg-white dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-sm font-medium w-full"
                />
              </div>

              {/* Advanced select dropdowns */}
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
                <option value="all">All Flags</option>
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
            </div>

            {/* Smart Filters tags block */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {activeFiltersList.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Active filters:</span>
                  {activeFiltersList.map((f) => (
                    <Badge
                      key={f.key}
                      variant="outline"
                      className="inline-flex items-center gap-1 px-2 py-0.5 h-6 rounded-full border bg-white dark:bg-slate-900 border-border font-medium text-xs text-foreground"
                    >
                      {f.label}
                      <button
                        onClick={f.reset}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-muted p-0.5 transition-colors"
                        aria-label={`Remove filter ${f.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="h-6 px-2 text-xs text-rose-500 font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20"
                  >
                    Clear All
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">No active filter queries</span>
              )}

              {/* Action buttons on the right */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.refresh()}
                  className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                </Button>
              </div>
            </div>
          </div>

          {/* Complaint Intelligence Banner */}
          <div className="bg-primary/[0.03] dark:bg-primary/[0.01] border-l-4 border-l-primary rounded-r-xl border border-border/80 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in no-print">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 bg-primary/10 text-primary mt-0.5 shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Intelligence & Recommendation</h4>
                <p className="text-sm text-foreground/90 font-medium">
                  {aiRecommendation}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                <span>{totalRows} Complaints</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <span>{overdueCount} Overdue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>{awaitingReplyCount} Awaiting Reply</span>
              </div>
            </div>
          </div>

          {/* Premium Data Table Workspace */}
          <div className="hidden md:block rounded-xl border border-border/85 bg-gradient-to-br from-card via-card to-muted/15 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950/65 shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden animate-page-slide">
            <div className="overflow-x-auto max-h-[calc(100vh-280px)]">
              <Table className="w-full text-left border-collapse">
                <TableHeader className="sticky top-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-border/80 z-10 shadow-2xs">
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="hover:bg-transparent border-none">
                      {hg.headers.map((h) => (
                        <TableHead
                          key={h.id}
                          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-3.5 px-4"
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
                        className="group h-[76px] odd:bg-card/35 dark:odd:bg-slate-900/35 even:bg-muted/10 dark:even:bg-slate-950/10 hover:bg-primary/[0.03] dark:hover:bg-primary/[0.04] transition-all duration-150 border-b border-border/40 hover:shadow-3xs relative overflow-hidden"
                      >
                        {row.getVisibleCells().map((cell, idx) => (
                          <TableCell
                            key={cell.id}
                            className={cn(
                              "align-middle py-3 px-4 relative",
                              idx === 0 && "pl-4"
                            )}
                          >
                            {/* Accent bar on left boundary for hovered rows */}
                            {idx === 0 && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                            )}
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

          {/* Mobile Stack Layout */}
          <div className="block md:hidden space-y-4">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900/40 dark:border-slate-800">
                No complaints match these filters.
              </div>
            ) : (
              table.getRowModel().rows.map((row) => (
                <ComplaintCard key={row.original.id} c={row.original} router={router} />
              ))
            )}
          </div>

          {/* Bottom Pagination & Count Info */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500 dark:text-slate-500 no-print border-t border-slate-100 dark:border-slate-850 pt-4">
            <span className="font-semibold text-center sm:text-left text-xs">
              Showing {fromRow}–{toRow} of {totalRows} complaints
            </span>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="h-9 sm:h-8 px-4 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Previous
              </Button>
              <span className="text-xs font-bold px-3 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-700">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="h-9 sm:h-8 px-4 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* Right Side: Sticky AI Insights Sidebar */}
        <div className="lg:col-span-1 lg:sticky lg:top-[76px] space-y-6 no-print">
          {/* AI Insights Panel */}
          <Card className="border border-border/80 shadow-xs rounded-xl bg-card overflow-hidden">
            <div className="bg-primary/5 dark:bg-primary/10 border-b border-border/50 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">AI Recommendation</span>
              </div>
              <Badge className="bg-amber-150 text-amber-855 border-none font-bold text-[10px] py-0.5 rounded-full dark:bg-amber-950/40 dark:text-amber-400">
                Medium Risk
              </Badge>
            </div>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Primary Incident Hub</span>
                <p className="text-xs font-semibold text-slate-850 dark:text-slate-200">{topDivision || "Kendra Division"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Average resolution</span>
                <p className="text-xs font-semibold text-slate-850 dark:text-slate-200">4.2 days</p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Incidents trend</span>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Down by 8% this week
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resolution estimate</span>
                <p className="text-xs text-slate-500">
                  92% within 10 days of intake. Overdues are centered around garbage disposal logs.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Quick Filters Panel */}
          <Card className="border border-border/80 shadow-xs rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Quick Filters</span>
            </div>
            <CardContent className="p-3 space-y-1 flex flex-col">
              <button
                onClick={() => applyQuickFilter("today")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors"
              >
                Due Today
              </button>
              <button
                onClick={() => applyQuickFilter("overdue")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
              >
                <span>Overdue Follow-ups</span>
                {overdueCount > 0 && <Badge variant="destructive" className="h-4 px-1 text-[9px] font-bold">{overdueCount}</Badge>}
              </button>
              <button
                onClick={() => applyQuickFilter("reply")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors"
              >
                Awaiting Reply
              </button>
              <button
                onClick={() => applyQuickFilter("high")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors"
              >
                High Priority
              </button>
              <button
                onClick={() => applyQuickFilter("draft")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
              >
                <span>In Printing Queue</span>
                {printQueueCount > 0 && <Badge className="bg-slate-200 text-slate-850 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 h-4 px-1 text-[9px] font-bold">{printQueueCount}</Badge>}
              </button>
              <button
                onClick={() => applyQuickFilter("open")}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-650 hover:bg-slate-100 dark:text-slate-355 dark:hover:bg-slate-800 transition-colors"
              >
                Open (Pending Resolution)
              </button>
            </CardContent>
          </Card>

          {/* Quick Categories Bar Chart Preview */}
          <Card className="border border-border/80 shadow-xs rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Category Breakdown</span>
            </div>
            <CardContent className="p-4 space-y-3.5">
              <CategoryProgress label="Roads & Footpaths" count={data.filter(c => c.type === "Road" || c.type === "Footpath").length} total={totalCount} color="bg-primary" />
              <CategoryProgress label="Drains & Sewage" count={data.filter(c => c.type === "Drain" || c.type === "Water Logging").length} total={totalCount} color="bg-blue-500" />
              <CategoryProgress label="Garbage disposal" count={data.filter(c => c.type === "Garbage").length} total={totalCount} color="bg-rose-500" />
              <CategoryProgress label="Streetlights" count={data.filter(c => c.type === "Streetlight").length} total={totalCount} color="bg-amber-500" />
              <CategoryProgress label="Administrative issues" count={data.filter(c => c.type === "Tender Irregularity" || c.type === "Bill Payment" || c.type === "Contractor Issue").length} total={totalCount} color="bg-teal" />
            </CardContent>
          </Card>

          {/* Dynamic Recent Activity Timeline */}
          <Card className="border border-border/80 shadow-xs rounded-xl bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Recent updates</span>
            </div>
            <CardContent className="p-4">
              <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-border/60">
                {recentActivities.map((act) => (
                  <div key={act.id} className="flex gap-3 relative items-start group">
                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 z-10 shadow-3xs", act.color)}>
                      <act.IconCls className="h-3 w-3" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <span className="text-[10px] font-bold text-muted-foreground block leading-none">{act.time}</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">{act.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-450 truncate max-w-[160px]">
                        {act.ref} · {act.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating Bulk Operations Bar (Linear / Stripe style) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-slate-950 text-white rounded-xl shadow-2xl px-5 py-3.5 flex items-center gap-4 animate-page-slide border border-slate-800">
          <span className="text-xs font-bold text-slate-350">{selectedIds.length} complaints selected</span>
          <div className="h-4 w-px bg-slate-800" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Trigger browser print for selected complaints details
              window.print();
            }}
            className="h-8 text-xs font-semibold hover:bg-slate-850 text-white gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Mock action to clear selections or prompt assignment
              setSelectedIds([]);
            }}
            className="h-8 text-xs font-semibold hover:bg-slate-850 text-white gap-1.5"
          >
            <User className="h-3.5 w-3.5" /> Bulk Assign
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
            className="h-8 text-xs font-semibold hover:bg-slate-850 text-slate-400"
          >
            Clear Selection
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Secondary Layout Components ──────────────────────────────────────────

function SortBtn({
  column,
  label,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  const isSorted = column.getIsSorted();
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors font-bold uppercase text-[10px]",
        isSorted && "text-primary dark:text-primary"
      )}
      onClick={() => column.toggleSorting(isSorted === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3 opacity-60 ml-0.5" />
    </button>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  colorClass,
  sparkline,
  trend,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  sparkline?: React.ReactNode;
  trend?: React.ReactNode;
}) {
  return (
    <Card className="border border-border/80 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ease-in-out bg-card overflow-hidden group">
      <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
        <div className="flex items-start justify-between gap-1">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground line-clamp-1">
              {label}
            </span>
            <div className="text-xl font-extrabold tracking-tight text-slate-850 dark:text-slate-100">
              <AnimatedNumber value={value} />
            </div>
          </div>
          <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 shadow-3xs", colorClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/30 gap-2">
          <div className="shrink-0">{trend}</div>
          {sparkline && <div className="opacity-80 group-hover:opacity-100 transition-opacity">{sparkline}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryProgress({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <span className="truncate max-w-[120px]">{label}</span>
        <span className="shrink-0">{count} ({percent}%)</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// Simple fallback mail icon
function MailIconPlaceholder({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
