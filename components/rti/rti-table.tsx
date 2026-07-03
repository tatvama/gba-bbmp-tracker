"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown, Search, Download, RefreshCw, X, Plus, Eye, Construction,
  Lightbulb, Trash2, Folder, AlertTriangle, ArrowUp, ArrowDown, Minus,
  Droplet, Briefcase, SlidersHorizontal, ChevronDown, ChevronUp, Calendar,
  User, Building2, Gavel, Scale, Siren, AlertOctagon, ClipboardCheck,
  FileWarning, CheckCircle2, FileText, Hourglass, MailCheck, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { activeDeadline, daysBetween } from "@/lib/rti-deadlines";
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
  "h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-slate-800 dark:focus:ring-slate-800 cursor-pointer";

const DEADLINE_OPTIONS = [
  { value: "all", label: "Any deadline" },
  { value: "overdue", label: "Overdue" },
  { value: "due-soon", label: "Due Soon" },
  { value: "due-today", label: "Due Today" },
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

function orDash(val: any, fallback: string = "—") {
  return val ? (
    val
  ) : (
    <span className="text-xs text-slate-400 dark:text-slate-500 italic font-medium">
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
  if (!category) return orDash(category);
  let Icon = Folder;
  switch (category) {
    case "Road Work": Icon = Construction; break;
    case "Streetlight": Icon = Lightbulb; break;
    case "Garbage": Icon = Trash2; break;
    case "Drain Work": Icon = Droplet; break;
    case "Tender": Icon = Briefcase; break;
  }
  return (
    <Badge variant="outline" className="inline-flex items-center gap-1.5 px-2 py-0.5 h-5.5 rounded-md border-slate-200 bg-slate-50/60 text-slate-800 font-extrabold text-[11px] dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-300">
      <Icon className="h-3 w-3 text-slate-400 shrink-0" />
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
      cls = "border-rose-250 bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-455";
      break;
    case "High":
      Icon = ArrowUp;
      cls = "border-amber-250 bg-amber-50/70 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-455";
      break;
    case "Medium":
      Icon = Minus;
      cls = "border-blue-250 bg-blue-50/70 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-455";
      break;
    case "Low":
      Icon = ArrowDown;
      cls = "border-slate-250 bg-slate-50/70 text-slate-600 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-455";
      break;
    default:
      cls = "border-slate-200 bg-slate-50 text-slate-600";
  }
  return (
    <Badge variant="outline" className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 h-5.5 rounded-md font-black text-[11px] border", cls)}>
      <Icon className="h-3 w-3 shrink-0 opacity-80" />
      {priority}
    </Badge>
  );
}

export function RtiTable({
  data,
  rules = DEFAULT_DEADLINE_RULES,
  canEdit = false,
}: {
  data: RtiWithRelations[];
  rules?: DeadlineRules;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [deadline, setDeadline] = React.useState("all");
  const [officer, setOfficer] = React.useState("all");
  const [ward, setWard] = React.useState("all");
  const [authority, setAuthority] = React.useState("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Pagination states
  const [pageIndex, setPageIndex] = React.useState(0);
  const pageSize = 15;

  // Dynamic extract filters
  const officersList = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => {
      if (r.contact?.full_name) s.add(r.contact.full_name);
    });
    return Array.from(s).sort();
  }, [data]);

  const wardsList = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => {
      if (r.ward?.new_name) s.add(r.ward.new_name);
    });
    return Array.from(s).sort();
  }, [data]);

  const authoritiesList = React.useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => {
      if (r.public_authority) s.add(r.public_authority);
    });
    return Array.from(s).sort();
  }, [data]);

  // Filters logic
  const filtered = React.useMemo(() => {
    return data.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (category !== "all" && r.category !== category) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (officer !== "all" && r.contact?.full_name !== officer) return false;
      if (ward !== "all" && r.ward?.new_name !== ward) return false;
      if (authority !== "all" && r.public_authority !== authority) return false;
      if (deadline !== "all") {
        const active = activeDeadline(r, new Date(), rules);
        const bucket = active?.bucket ?? null;
        if (deadline === "overdue") {
          if (bucket !== "overdue" && bucket !== "critical-overdue") return false;
        } else if (bucket !== deadline) return false;
      }
      if (globalFilter !== "") {
        const hay = [r.internal_ref, r.subject, r.category, r.public_authority, r.pio_name, r.job_number]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(globalFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, status, category, priority, officer, ward, authority, deadline, globalFilter, rules]);

  // Reset pagination on filter update
  React.useEffect(() => {
    setPageIndex(0);
  }, [globalFilter, status, category, priority, deadline, officer, ward, authority]);

  // Pagination calculation
  const totalRows = filtered.length;
  const pageCount = Math.ceil(totalRows / pageSize);
  const paginated = React.useMemo(() => {
    const start = pageIndex * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex]);

  const fromRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const toRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  // Executive counts calculated from original data
  const stats = React.useMemo(() => {
    let awaiting = 0;
    let overdueCount = 0;
    let activeAppeals = 0;
    let closedCount = 0;

    data.forEach((r) => {
      const active = activeDeadline(r, new Date(), rules);
      const isOverdue = active?.bucket === "overdue" || active?.bucket === "critical-overdue";
      if (r.status === "Awaiting Reply" || r.status === "Filed") awaiting++;
      if (isOverdue) overdueCount++;
      if (r.status.toLowerCase().includes("appeal") || r.status.toLowerCase().includes("faa")) activeAppeals++;
      if (r.status === "Closed") closedCount++;
    });

    return { total: data.length, awaiting, overdueCount, activeAppeals, closedCount };
  }, [data, rules]);

  // Insight Counts
  const insightStats = React.useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let awaitingFaa = 0;
    let requireEscalation = 0;

    data.forEach((r) => {
      const active = activeDeadline(r, new Date(), rules);
      if (active?.bucket === "overdue" || active?.bucket === "critical-overdue") overdue++;
      if (active?.bucket === "due-soon") dueSoon++;
      if (r.status === "First Appeal Filed" || r.status === "Second Appeal Filed") awaitingFaa++;
      if (r.status === "No Reply" || r.status === "Rejected") requireEscalation++;
    });

    return { overdue, dueSoon, awaitingFaa, requireEscalation };
  }, [data, rules]);

  const hasFilters =
    globalFilter !== "" ||
    status !== "all" ||
    category !== "all" ||
    priority !== "all" ||
    officer !== "all" ||
    ward !== "all" ||
    authority !== "all" ||
    deadline !== "all";

  function reset() {
    setGlobalFilter("");
    setStatus("all");
    setCategory("all");
    setPriority("all");
    setDeadline("all");
    setOfficer("all");
    setWard("all");
    setAuthority("all");
  }

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
    <div className="space-y-6 animate-fade-in">
      {/* Executive KPI Section */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5 select-none">
        {/* Total RTIs */}
        <Card
          onClick={() => reset()}
          className="border border-slate-200/85 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 border-l-primary"
        >
          <CardContent className="p-5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Total Applications</span>
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-0.5">
              <span className="text-3xl font-black text-slate-900 dark:text-slate-100 block tracking-tight">{stats.total}</span>
              <span className="text-[11px] font-semibold text-slate-450 dark:text-slate-500">All-time active records</span>
            </div>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Awaiting Reply */}
        <Card
          onClick={() => { reset(); setStatus("Awaiting Reply"); }}
          className="border border-slate-200/85 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 border-l-blue-500"
        >
          <CardContent className="p-5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Awaiting Reply</span>
              <Hourglass className="h-4 w-4 text-blue-500" />
            </div>
            <div className="space-y-0.5">
              <span className="text-3xl font-black text-slate-900 dark:text-slate-100 block tracking-tight">{stats.awaiting}</span>
              <span className="text-[11px] font-semibold text-slate-455 dark:text-slate-500">Within statutory terms</span>
            </div>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${stats.total ? (stats.awaiting / stats.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card
          onClick={() => { reset(); setDeadline("overdue"); }}
          className="border border-slate-200/85 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 border-l-rose-500"
        >
          <CardContent className="p-5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Overdue Applications</span>
              <AlertOctagon className="h-4 w-4 text-rose-500 animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <span className="text-3xl font-black text-rose-600 dark:text-rose-400 block tracking-tight">{stats.overdueCount}</span>
              <span className="text-[11px] font-semibold text-slate-455 dark:text-slate-500">Action required immediately</span>
            </div>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${stats.total ? (stats.overdueCount / stats.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Appeals Active */}
        <Card
          onClick={() => { reset(); setStatus("First Appeal Filed"); }}
          className="border border-slate-200/85 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 border-l-amber-500"
        >
          <CardContent className="p-5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Active Appeals</span>
              <Scale className="h-4 w-4 text-amber-500" />
            </div>
            <div className="space-y-0.5">
              <span className="text-3xl font-black text-slate-900 dark:text-slate-100 block tracking-tight">{stats.activeAppeals}</span>
              <span className="text-[11px] font-semibold text-slate-455 dark:text-slate-500">FAA &amp; Commission level</span>
            </div>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${stats.total ? (stats.activeAppeals / stats.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* Closed */}
        <Card
          onClick={() => { reset(); setStatus("Closed"); }}
          className="border border-slate-200/85 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-4 border-l-emerald-500"
        >
          <CardContent className="p-5 space-y-2.5">
            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              <span>Closed Applications</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="space-y-0.5">
              <span className="text-3xl font-black text-slate-900 dark:text-slate-100 block tracking-tight">{stats.closedCount}</span>
              <span className="text-[11px] font-semibold text-slate-455 dark:text-slate-500">Fully resolved audits</span>
            </div>
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${stats.total ? (stats.closedCount / stats.total) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Operational Insight Strip */}
      <div className="flex flex-wrap gap-2.5 items-center bg-slate-50/45 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850 p-3 rounded-xl text-xs font-semibold text-slate-550 dark:text-slate-400 select-none">
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1.5 flex items-center gap-1">
          <Info className="h-3.5 w-3.5 text-primary" /> Active Alerts:
        </span>
        <button onClick={() => { reset(); setDeadline("overdue"); }} className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-rose-700 cursor-pointer dark:bg-slate-900 dark:border-slate-800">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" /> {insightStats.overdue} Overdue
        </button>
        <button onClick={() => { reset(); setDeadline("due-soon"); }} className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-amber-700 cursor-pointer dark:bg-slate-900 dark:border-slate-800">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> {insightStats.dueSoon} Due within 7d
        </button>
        <button onClick={() => { reset(); setStatus("First Appeal Filed"); }} className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-blue-700 cursor-pointer dark:bg-slate-900 dark:border-slate-800">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> {insightStats.awaitingFaa} Awaiting FAA Order
        </button>
        <button onClick={() => { reset(); setStatus("No Reply"); }} className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-indigo-700 cursor-pointer dark:bg-slate-900 dark:border-slate-800">
          <span className="h-2 w-2 rounded-full bg-indigo-500" /> {insightStats.requireEscalation} Require FAA Escalation
        </button>
      </div>

      {/* Smart Action Toolbar */}
      <Card className="border border-border/80 shadow-2xs rounded-xl overflow-hidden bg-card no-print">
        <CardContent className="p-4 space-y-3.5">
          <div className="flex flex-col lg:flex-row gap-3.5 items-stretch lg:items-center justify-between">
            {/* Search + 7 Filters */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 shrink-0 pointer-events-none" />
                <Input
                  placeholder="Search ref, subject, authority…"
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-9 w-64 text-xs pl-9 bg-white dark:bg-slate-955/40 border-slate-250 dark:border-slate-800"
                />
              </div>

              {/* Status Select */}
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
                <option value="all">Any Status</option>
                {RTI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              {/* Category Select */}
              <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter">
                <option value="all">Any Category</option>
                {RTI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Priority Select */}
              <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority filter">
                <option value="all">Any Priority</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Deadline Select */}
              <select className={selectCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline filter">
                {DEADLINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {/* Officer Select */}
              <select className={selectCls} value={officer} onChange={(e) => setOfficer(e.target.value)} aria-label="Officer filter">
                <option value="all">Any Officer</option>
                {officersList.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>

              {/* Ward Select */}
              <select className={selectCls} value={ward} onChange={(e) => setWard(e.target.value)} aria-label="Ward filter">
                <option value="all">Any Ward</option>
                {wardsList.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>

              {/* Authority Select */}
              <select className={selectCls} value={authority} onChange={(e) => setAuthority(e.target.value)} aria-label="Authority filter">
                <option value="all">Any Authority</option>
                {authoritiesList.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Utility Commands (Right) */}
            <div className="flex items-center gap-2 self-end lg:self-auto shrink-0">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={reset} className="h-9 px-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">
                  <X className="h-4 w-4 mr-1.5" /> Clear
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => doExport("csv")} className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 rounded-lg cursor-pointer">
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExport("xlsx")} className="h-9 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 rounded-lg cursor-pointer">
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.refresh()} className="h-9 w-9 shrink-0 dark:border-slate-800 dark:bg-slate-900 rounded-lg flex items-center justify-center cursor-pointer" aria-label="Refresh data">
                <RefreshCw className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>

          {/* Active Filter Pills Row (Row 2) */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100/50 dark:border-slate-850/50 pt-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mr-1.5 select-none">Active Filters:</span>
              {globalFilter && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Search: &quot;{globalFilter}&quot;
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setGlobalFilter("")} />
                </Badge>
              )}
              {status !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Status: {status}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setStatus("all")} />
                </Badge>
              )}
              {category !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Category: {category}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setCategory("all")} />
                </Badge>
              )}
              {priority !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Priority: {priority}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setPriority("all")} />
                </Badge>
              )}
              {deadline !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Deadline: {deadline}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setDeadline("all")} />
                </Badge>
              )}
              {officer !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Officer: {officer}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setOfficer("all")} />
                </Badge>
              )}
              {ward !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Ward: {ward}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setWard("all")} />
                </Badge>
              )}
              {authority !== "all" && (
                <Badge variant="outline" className="flex items-center gap-1 bg-slate-50 text-[10px] font-bold py-0.5 rounded px-2 text-slate-650">
                  Authority: {authority}
                  <X className="h-3 w-3 hover:text-slate-900 cursor-pointer shrink-0" onClick={() => setAuthority("all")} />
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enterprise Data Workspace Grid (TABLE LAYOUT) */}
      {filtered.length === 0 ? (
        /* Empty State */
        <Card className="border border-slate-200 border-dashed rounded-xl bg-slate-50/20 dark:border-slate-800 dark:bg-slate-950/10 p-12 text-center select-none animate-in fade-in duration-200">
          <CardContent className="space-y-4 max-w-md mx-auto flex flex-col items-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-250">No RTIs match your filters</h3>
              <p className="text-xs text-slate-550 dark:text-slate-455 leading-relaxed">
                Try changing filters or create a new RTI.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={reset} variant="outline" className="h-9 font-bold bg-white dark:bg-slate-900 dark:border-slate-855">
                Reset filters
              </Button>
              {canEdit && (
                <Button type="button" size="sm" asChild className="h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-xs">
                  <Link href="/rti/new">
                    <Plus className="h-4 w-4 mr-1" /> Create RTI
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Work Item Structured Table Layout */
        <>
          {/* Desktop & Tablet Table Layout */}
          <div className="hidden md:block rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                {/* TABLE HEADERS */}
                <thead className="bg-slate-100/90 dark:bg-slate-900/80 border-b border-border select-none">
                  <tr>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-6 w-[140px]">Ref &amp; Date</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[280px]">Subject &amp; Authority</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[160px]">Workflow Status</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[120px]">Category</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[100px]">Priority</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[150px]">Deadline</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-4 w-[140px]">Assigned Officer</th>
                    <th className="text-[11.5px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-350 py-3.5 px-6 text-right w-[110px]">Actions</th>
                  </tr>
                </thead>

                {/* TABLE BODY ROWS */}
                <tbody className="divide-y divide-border/60">
                  {paginated.map((r) => {
                    const isExpanded = expandedId === r.id;
                    const active = activeDeadline(r, new Date(), rules);
                    const remainingDays = active ? daysBetween(new Date(), active.due) : null;
                    const dueInText = remainingDays !== null
                      ? remainingDays < 0
                        ? `${Math.abs(remainingDays)}d overdue`
                        : `${remainingDays}d left`
                      : "No deadline";

                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className={cn(
                            "group hover:bg-slate-50/40 dark:hover:bg-slate-900/10 transition-colors cursor-pointer select-none",
                            isExpanded && "bg-slate-50/15 dark:bg-slate-900/5"
                          )}
                        >
                          {/* Ref & Date */}
                          <td className="py-4 px-6 relative">
                            {/* Accent status left indicator bar */}
                            <div className={cn(
                              "absolute inset-y-0 left-0 w-1",
                              r.status === "Closed" ? "bg-slate-300 dark:bg-slate-700" : active?.bucket.includes("overdue") ? "bg-rose-500" : "bg-primary"
                            )} />
                            <div className="space-y-1.5 pl-1.5">
                              <span className="font-mono text-[13px] font-black text-slate-900 dark:text-slate-100">
                                {r.internal_ref || "PENDING"}
                              </span>
                              <span className="text-[11.5px] text-slate-750 dark:text-slate-300 font-extrabold block leading-none">
                                {formatDate(r.created_at)}
                              </span>
                            </div>
                          </td>

                          {/* Subject & Authority */}
                          <td className="py-4 px-4">
                            <div className="space-y-1.5 max-w-[280px]">
                              <h3 className="font-extrabold text-[13px] text-slate-900 dark:text-slate-100 leading-normal block truncate" title={r.subject}>
                                {r.subject}
                              </h3>
                              <div className="text-[11.5px] text-slate-700 dark:text-slate-300 font-extrabold truncate leading-none" title={r.public_authority || ""}>
                                {orDash(r.public_authority)} {r.ward ? `· Ward ${r.ward.new_no}` : ""}
                              </div>
                            </div>
                          </td>

                          {/* Workflow Status */}
                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              <RtiStatusBadge status={r.status} />
                              <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 leading-none pl-0.5">
                                {r.status === "Closed" ? "Closed" : `Next: ${getWorkflowStage(r.status)}`}
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-4 px-4">
                            <CategoryChip category={r.category} />
                          </td>

                          {/* Priority */}
                          <td className="py-4 px-4">
                            <PriorityChip priority={r.priority} />
                          </td>

                          {/* Deadline */}
                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              <Badge variant={remainingDays !== null && remainingDays < 0 ? "destructive" : "muted"} className="text-[11px] font-extrabold py-0.5 px-2">
                                {dueInText}
                              </Badge>
                              {r.normal_due && (
                                <span className="text-[11px] text-slate-700 dark:text-slate-300 font-extrabold block leading-none pl-0.5">
                                  Due: {formatDate(r.normal_due)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Assigned Officer */}
                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              <span className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 block truncate" title={r.contact?.full_name || ""}>
                                {r.contact ? r.contact.full_name : "Unassigned"}
                              </span>
                              <span className="text-[11.5px] text-slate-700 dark:text-slate-300 font-extrabold block leading-none">
                                {getRelativeTime(r.updated_at)}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                                className="rounded-lg p-1.5 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                                aria-label="Toggle details"
                              >
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                              <Button asChild size="sm" className="h-8 font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer text-xs px-2.5">
                                <Link href={`/rti/${r.id}`}>
                                  View
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Row Expanded Details */}
                        <tr className={cn(
                          "bg-slate-50/15 dark:bg-slate-900/5 transition-all duration-300",
                          isExpanded ? "border-t border-border/40" : "border-none"
                        )}>
                          <td colSpan={8} className="p-0">
                            <div className={cn(
                              "grid transition-all duration-300 ease-in-out",
                              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                            )}>
                              <div className="overflow-hidden">
                                <div className="p-6 space-y-4 bg-slate-50/10 dark:bg-slate-900/5">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-medium text-slate-655 dark:text-slate-450">
                                    {/* Section 1: Detailed Metadata & PIO */}
                                    <div className="space-y-2">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">PIO Contact &amp; Authority</span>
                                      <div className="space-y-1.5">
                                        <div><span className="text-slate-400 font-semibold">Officer:</span> <strong className="text-slate-855 dark:text-slate-205">{orDash(r.pio_name)}</strong></div>
                                        <div><span className="text-slate-400 font-semibold">Designation:</span> <span className="text-slate-700 dark:text-slate-300">{orDash(r.pio_designation)}</span></div>
                                        <div><span className="text-slate-400 font-semibold">Phone:</span> <span className="text-slate-700 dark:text-slate-300">{orDash(r.pio_phone)}</span></div>
                                        <div><span className="text-slate-400 font-semibold">Email:</span> <span className="text-slate-700 dark:text-slate-300">{orDash(r.pio_email)}</span></div>
                                      </div>
                                    </div>

                                    {/* Section 2: Subject Description & Notes */}
                                    <div className="space-y-2">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Info Requested &amp; Scope</span>
                                      <p className="text-slate-600 dark:text-slate-350 leading-relaxed font-semibold italic">
                                        {r.info_requested || "No description notes logged for this RTI application."}
                                      </p>
                                    </div>

                                    {/* Section 3: Stat Timeline & Actions */}
                                    <div className="space-y-2">
                                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Statutory Timeline</span>
                                      <div className="space-y-1 text-[11px]">
                                        <div className="flex items-center gap-1.5 text-emerald-600">
                                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                          <span>Filed: {r.date_filed ? formatDate(r.date_filed) : "Not filed"}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-slate-600">
                                          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                          <span>Reply due: {r.normal_due ? formatDate(r.normal_due) : "—"}</span>
                                        </div>
                                        {r.first_appeal_due && (
                                          <div className="flex items-center gap-1.5 text-slate-650">
                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                            <span>FAA due: {formatDate(r.first_appeal_due)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Quick Row Action triggers */}
                                  <div className="flex items-center gap-2 border-t border-border/40 pt-3.5 mt-2.5 flex-wrap">
                                    <Button asChild size="sm" variant="outline" className="h-8 text-[11px] font-bold cursor-pointer bg-white">
                                      <Link href={`/rti/${r.id}`}>
                                        <Eye className="h-3.5 w-3.5 mr-1" /> View Full Case
                                      </Link>
                                    </Button>
                                    {r.reply_attachment && (
                                      <Button asChild size="sm" variant="outline" className="h-8 text-[11px] font-bold cursor-pointer bg-white">
                                        <a href={r.reply_attachment} target="_blank" rel="noreferrer">
                                          <Download className="h-3.5 w-3.5 mr-1" /> Download Reply Attachment
                                        </a>
                                      </Button>
                                    )}
                                    {canEdit && (
                                      <>
                                        <Button asChild size="sm" variant="outline" className="h-8 text-[11px] font-bold cursor-pointer bg-white">
                                          <Link href={`/rti/${r.id}?tab=appeals`}>
                                            <Scale className="h-3.5 w-3.5 mr-1 text-slate-450" /> File FAA Appeal
                                          </Link>
                                        </Button>
                                        <Button asChild size="sm" variant="outline" className="h-8 text-[11px] font-bold cursor-pointer bg-white">
                                          <Link href={`/rti/${r.id}?tab=replies`}>
                                            <MailCheck className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Record PIO Reply
                                          </Link>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card Layout */}
          <div className="block md:hidden space-y-4">
            {paginated.map((r) => {
              const active = activeDeadline(r, new Date(), rules);
              const remainingDays = active ? daysBetween(new Date(), active.due) : null;
              const dueInText = remainingDays !== null
                ? remainingDays < 0
                  ? `${Math.abs(remainingDays)}d overdue`
                  : `${remainingDays}d left`
                : "No deadline";

              return (
                <Card
                  key={r.id}
                  className="relative border border-slate-200 dark:border-slate-800 bg-card hover:border-slate-350 dark:hover:border-slate-700 shadow-2xs hover:shadow-xs transition-all duration-250 rounded-xl overflow-hidden"
                >
                  <div className={cn(
                    "absolute inset-y-0 left-0 w-1.5",
                    r.status === "Closed" ? "bg-slate-300 dark:bg-slate-700" : active?.bucket.includes("overdue") ? "bg-rose-500" : "bg-primary"
                  )} />
                  <CardContent className="p-5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[13px] font-black text-slate-900 dark:text-slate-100 bg-slate-100/80 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {r.internal_ref || "PENDING"}
                      </span>
                      <RtiStatusBadge status={r.status} />
                    </div>
                    
                    <div className="space-y-1.5">
                      <h3 className="font-extrabold text-[13.5px] text-slate-900 dark:text-slate-100 leading-normal line-clamp-2">
                        {r.subject}
                      </h3>
                      <p className="text-[11.5px] text-slate-700 dark:text-slate-300 font-extrabold">
                        {orDash(r.public_authority)} {r.ward ? `· Ward ${r.ward.new_no}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center text-[11px] text-slate-655 dark:text-slate-400 font-bold border-y border-slate-100 dark:border-slate-800/60 py-2.5">
                      <CategoryChip category={r.category} />
                      <PriorityChip priority={r.priority} />
                      {remainingDays !== null && (
                        <Badge variant={remainingDays < 0 ? "destructive" : "muted"} className="text-[11px] font-extrabold py-0.5">
                          {dueInText}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-350">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-450 block uppercase font-bold tracking-wider">Assigned Officer</span>
                        <span className="font-extrabold text-[12.5px] text-slate-900 dark:text-slate-100">{r.contact ? r.contact.full_name : "Unassigned"}</span>
                      </div>
                      <Button asChild className="h-10 font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer text-xs px-5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/95">
                        <Link href={`/rti/${r.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Desktop Pagination & Footer */}
      <div className="hidden md:flex mt-3 items-center justify-between text-sm text-slate-500 dark:text-slate-500 no-print select-none">
        <span className="font-medium">
          Showing {fromRow}–{toRow} of {totalRows} RTIs
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
              className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Previous
            </Button>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-700">
              Page {pageIndex + 1} of {pageCount || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(Math.min(pageCount - 1, pageIndex + 1))}
              disabled={pageIndex >= pageCount - 1}
              className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Mobile Pagination & Footer */}
      <div className="flex md:hidden flex-col items-center gap-3 mt-4 text-sm text-slate-500 dark:text-slate-500 no-print select-none w-full border-t border-slate-100 dark:border-slate-800/80 pt-3">
        <span className="font-semibold text-xs text-slate-400 dark:text-slate-500">
          Showing {fromRow}–{toRow} of {totalRows} RTIs
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2.5 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
              className="h-11 flex-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg cursor-pointer bg-white"
            >
              Previous
            </Button>
            <span className="text-xs font-semibold px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border dark:border-slate-700 shrink-0">
              {pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex(Math.min(pageCount - 1, pageIndex + 1))}
              disabled={pageIndex >= pageCount - 1}
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
