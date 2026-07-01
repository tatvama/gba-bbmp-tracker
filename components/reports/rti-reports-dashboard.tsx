"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  MailWarning,
  MessageSquareWarning,
  Scale,
  Building,
  CheckCircle2,
  Download,
  Eye,
  Search,
  X,
  FileText,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import { activeDeadline, daysBetween } from "@/lib/rti-deadlines";
import { formatDate } from "@/lib/format";
import { exportRows } from "@/lib/export";
import { cn } from "@/lib/utils";
import type { RtiWithRelations } from "@/lib/types";
import type { DeadlineRules } from "@/lib/constants";

interface DashboardProps {
  rtis: RtiWithRelations[];
  firstAppeals: any[];
  secondAppeals: any[];
  rules: DeadlineRules;
}

export function RtiReportsDashboard({ rtis, firstAppeals, secondAppeals, rules }: DashboardProps) {
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [activeDialogSection, setActiveDialogSection] = React.useState<{
    title: string;
    columns: { key: string; label: string }[];
    rows: any[];
    fileBase: string;
  } | null>(null);
  const [expandedSection, setExpandedSection] = React.useState<string | null>(null);

  const handleExport = (format: "csv" | "xlsx" | "pdf" | "print", rows: any[], fileBase: string) => {
    if (format === "csv" || format === "xlsx") {
      const cleanRows = rows.map(({ raw, ...r }) => r);
      exportRows(cleanRows, fileBase, format);
    } else if (format === "pdf" || format === "print") {
      window.print();
    }
  };

  const now = React.useMemo(() => new Date(), []);
  const byId = React.useMemo(() => new Map(rtis.map((r) => [r.id, r])), [rtis]);

  // Helper to map RTI to row
  const mapRtiRow = React.useCallback(
    (r: RtiWithRelations) => {
      const a = activeDeadline(r, now, rules);
      return {
        id: r.id,
        ref: r.internal_ref ?? "",
        subject: r.subject,
        status: r.status,
        priority: r.priority,
        due: a ? a.due : null,
        dueFormatted: a ? formatDate(a.due) : "—",
        bucket: a ? a.label : "—",
        raw: r,
      };
    },
    [now, rules],
  );

  // 1. Overdue
  const overdue = React.useMemo(() => {
    return rtis
      .filter((r) => {
        const a = activeDeadline(r, now, rules);
        return a && (a.bucket === "overdue" || a.bucket === "critical-overdue");
      })
      .map(mapRtiRow);
  }, [rtis, mapRtiRow, now, rules]);

  // 2. Due in 7 Days
  const dueIn7 = React.useMemo(() => {
    return rtis
      .filter((r) => {
        const a = activeDeadline(r, now, rules);
        if (!a) return false;
        const d = daysBetween(now, a.due);
        return d >= 0 && d <= 7;
      })
      .map(mapRtiRow);
  }, [rtis, mapRtiRow, now, rules]);

  // 3. No Reply Past Deadline
  const noReply = React.useMemo(() => {
    return rtis
      .filter(
        (r) =>
          !r.reply_date &&
          ["Filed", "Awaiting Reply", "No Reply"].includes(r.status) &&
          r.normal_due &&
          daysBetween(now, r.normal_due) < 0,
      )
      .map(mapRtiRow);
  }, [rtis, mapRtiRow, now]);

  // 4. Incomplete / Partial Reply
  const incompleteReply = React.useMemo(() => {
    return rtis
      .filter(
        (r) =>
          r.status === "Partial Reply" ||
          r.satisfaction_status === "Partially Satisfied" ||
          r.satisfaction_status === "Incomplete Information",
      )
      .map(mapRtiRow);
  }, [rtis, mapRtiRow]);

  // 5. First Appeals Pending
  const firstAppealsPending = React.useMemo(() => {
    return firstAppeals
      .filter((fa) => !fa.faa_order_date)
      .map((fa) => {
        const r = byId.get(fa.rti_id);
        return {
          id: r?.id || "",
          ref: r?.internal_ref ?? "",
          subject: r?.subject ?? "(unknown RTI)",
          status: fa.status,
          grounds: fa.grounds.join(", "),
          filed: fa.date_filed ? formatDate(fa.date_filed) : "Draft",
          order_due: fa.faa_order_due ? formatDate(fa.faa_order_due) : "—",
          raw: r,
        };
      });
  }, [firstAppeals, byId]);

  // 6. Second Appeals Pending
  const secondAppealsPending = React.useMemo(() => {
    return secondAppeals
      .filter((sa) => !sa.order_date)
      .map((sa) => {
        const r = byId.get(sa.rti_id);
        return {
          id: r?.id || "",
          ref: r?.internal_ref ?? "",
          subject: r?.subject ?? "(unknown RTI)",
          status: sa.status,
          commission: sa.commission_name ?? "",
          diary: sa.diary_number ?? "",
          hearing: sa.hearing_date ? formatDate(sa.hearing_date) : "—",
          raw: r,
        };
      });
  }, [secondAppeals, byId]);

  // 7. Closed This Month
  const closedThisMonth = React.useMemo(() => {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return rtis
      .filter((r) => {
        if (r.status !== "Closed" || !r.updated_at) return false;
        return new Date(r.updated_at) >= startOfMonth;
      })
      .map(mapRtiRow);
  }, [rtis, mapRtiRow, now]);

  // Global search filtering
  const filterRows = <T extends Record<string, any>>(rows: T[]): T[] => {
    if (!globalFilter.trim()) return rows;
    const q = globalFilter.toLowerCase();
    return rows.filter(
      (r) =>
        (r.ref && r.ref.toLowerCase().includes(q)) ||
        (r.subject && r.subject.toLowerCase().includes(q)) ||
        (r.status && r.status.toLowerCase().includes(q)),
    );
  };

  const filteredOverdue = React.useMemo(() => filterRows(overdue), [overdue, globalFilter]);
  const filteredDueIn7 = React.useMemo(() => filterRows(dueIn7), [dueIn7, globalFilter]);
  const filteredNoReply = React.useMemo(() => filterRows(noReply), [noReply, globalFilter]);
  const filteredIncomplete = React.useMemo(() => filterRows(incompleteReply), [incompleteReply, globalFilter]);
  const filteredFirstAppeals = React.useMemo(() => filterRows(firstAppealsPending), [firstAppealsPending, globalFilter]);
  const filteredSecondAppeals = React.useMemo(() => filterRows(secondAppealsPending), [secondAppealsPending, globalFilter]);
  const filteredClosed = React.useMemo(() => filterRows(closedThisMonth), [closedThisMonth, globalFilter]);

  // Scroll helper
  const scrollToSection = (id: string) => {
    setExpandedSection(id);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const RTI_COLUMNS = [
    { key: "ref", label: "Ref" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "due", label: "Due" },
    { key: "actions", label: "Actions" },
  ];

  const FIRST_APPEAL_COLUMNS = [
    { key: "ref", label: "RTI Ref" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "grounds", label: "Grounds" },
    { key: "filed", label: "Filed" },
    { key: "order_due", label: "Order due" },
    { key: "actions", label: "Actions" },
  ];

  const SECOND_APPEAL_COLUMNS = [
    { key: "ref", label: "RTI Ref" },
    { key: "subject", label: "Subject" },
    { key: "status", label: "Status" },
    { key: "commission", label: "Commission" },
    { key: "diary", label: "Diary no." },
    { key: "hearing", label: "Hearing" },
    { key: "actions", label: "Actions" },
  ];

  // Refined Status Badges (Enterprise Government Style)
  const renderReportStatusBadge = (status: string) => {
    let bg = "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80";
    let dot = "bg-slate-400";
    switch (status) {
      case "Draft":
        bg = "bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-450 border-slate-200 dark:border-slate-800/80";
        dot = "bg-slate-400";
        break;
      case "Filed":
      case "Awaiting Reply":
        bg = "bg-blue-50/50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/50";
        dot = "bg-blue-500";
        break;
      case "Reply Received":
      case "FAA Order Received":
        bg = "bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/50";
        dot = "bg-emerald-500";
        break;
      case "Partial Reply":
        bg = "bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border-amber-100 dark:border-amber-900/50";
        dot = "bg-amber-500";
        break;
      case "Rejected":
      case "No Reply":
      case "Second Appeal Filed":
        bg = "bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-400 border-rose-100 dark:border-rose-900/50";
        dot = "bg-rose-500";
        break;
      case "First Appeal Drafted":
      case "First Appeal Filed":
        bg = "bg-purple-50/50 dark:bg-purple-950/20 text-purple-750 dark:text-purple-400 border-purple-100 dark:border-purple-900/50";
        dot = "bg-purple-500";
        break;
      case "Closed":
        bg = "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-750";
        dot = "bg-slate-500";
        break;
    }

    return (
      <span className={cn("inline-flex items-center gap-1.5 h-6 rounded-md border px-2.5 text-[11px] font-semibold tracking-wide select-none leading-none", bg)}>
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
        {status}
      </span>
    );
  };

  const renderCell = (row: any, colKey: string) => {
    const val = row[colKey];
    if (colKey === "actions") {
      const handleViewDetails = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!row.id) return;
        if (typeof document !== "undefined" && (document as any).startViewTransition) {
          (document as any).startViewTransition(() => {
            router.push(`/rti/${row.id}`);
          });
        } else {
          router.push(`/rti/${row.id}`);
        }
      };
      return (
        <div className="flex justify-end pr-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-850 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={handleViewDetails}
                  aria-label="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>View Details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    if (colKey === "ref") {
      return <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 font-medium">{val || "—"}</span>;
    }

    if (colKey === "subject") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 line-clamp-2 cursor-help max-w-sm leading-relaxed">
                {val}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md p-3 leading-relaxed text-xs">
              <p>{val}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (colKey === "status") {
      return renderReportStatusBadge(val);
    }

    if (colKey === "due" && row.raw) {
      return <DeadlineBadge rti={row.raw} rules={rules} />;
    }

    return <span className="text-sm text-slate-750 dark:text-slate-300">{val ?? "—"}</span>;
  };

  const renderReportTable = (
    columns: { key: string; label: string }[],
    rows: any[],
    sectionTitle: string,
    fileBase: string,
  ) => {
    const previewRows = rows.slice(0, 5);

    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-[#f8fafc] dark:border-slate-800/80 dark:bg-[#151f32]">
          <Table className="w-full text-left border-collapse">
            <TableHeader className="bg-slate-100/50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800/60">
              <TableRow className="hover:bg-transparent border-none">
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-3",
                      c.key === "actions" && "text-right pr-6",
                    )}
                  >
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.map((row, i) => (
                <TableRow
                  key={i}
                  className="h-16 odd:bg-transparent even:bg-slate-200/10 dark:even:bg-slate-900/10 hover:bg-slate-200/20 dark:hover:bg-slate-800/30 transition-colors duration-150 ease-out border-b border-slate-200/60 dark:border-slate-800/40"
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn("align-middle py-2.5", c.key === "actions" && "text-right pr-6")}
                    >
                      {renderCell(row, c.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {rows.length > 5 && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveDialogSection({ title: sectionTitle, columns, rows, fileBase })
              }
              className="text-xs font-semibold px-4 h-8 gap-1 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg"
            >
              View All ({rows.length})
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderReportCard = (
    id: string,
    title: string,
    description: string,
    count: number,
    columns: { key: string; label: string }[],
    rows: any[],
    fileBase: string,
    accentClass: string,
    icon: React.ReactNode,
  ) => {
    const isExpanded = expandedSection === id;

    return (
      <Card
        id={id}
        className={cn(
          "overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl transition-all duration-200 scroll-mt-24 dark:hover:border-slate-700/80",
          accentClass,
        )}
      >
        {/* Mobile Accordion Toggle Header */}
        <button
          type="button"
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className="w-full flex items-center justify-between p-3.5 text-left md:hidden cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-850"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 scale-90">{icon}</div>
            <span className="font-bold text-sm text-slate-850 dark:text-slate-200 truncate">{title}</span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border dark:border-slate-750 shrink-0">
              {count}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isExpanded ? (
              <ChevronUp className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            )}
          </div>
        </button>

        {/* Desktop Card Header */}
        <CardHeader className="hidden md:flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold text-foreground dark:text-slate-100">{title}</CardTitle>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border dark:border-slate-750">
                  {count}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-xl">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-slate-855 rounded-lg cursor-pointer gap-1"
                >
                  <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                <DropdownMenuItem onClick={() => handleExport("csv", rows, fileBase)} className="cursor-pointer text-xs">
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", rows, fileBase)} className="cursor-pointer text-xs">
                  Export to Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", rows, fileBase)} className="cursor-pointer text-xs">
                  Save as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("print", rows, fileBase)} className="cursor-pointer text-xs">
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        {/* Content panel: responsive display toggle */}
        <CardContent className={cn(
          "pt-4 pb-4 md:pt-5",
          isExpanded ? "block" : "hidden md:block"
        )}>
          {/* Mobile Description Helper inside expanded accordion */}
          <p className="md:hidden text-xs text-slate-550 dark:text-slate-400 mb-4 pb-2 border-b border-slate-100 dark:border-slate-850/60 leading-relaxed">
            {description}
          </p>

          {/* Mobile Dropdown Options inside content */}
          <div className="md:hidden flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-850/60">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-455">Reports Actions:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  className="h-9 px-3 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 rounded-lg cursor-pointer gap-1.5"
                >
                  <Download className="h-4 w-4" /> Export Options <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                <DropdownMenuItem onClick={() => handleExport("csv", rows, fileBase)} className="cursor-pointer text-xs">
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", rows, fileBase)} className="cursor-pointer text-xs">
                  Export to Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", rows, fileBase)} className="cursor-pointer text-xs">
                  Save as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("print", rows, fileBase)} className="cursor-pointer text-xs">
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {rows.length === 0 ? (
            <div>
              {/* Desktop Empty State */}
              <div className="hidden md:flex flex-col items-center justify-center py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
                  <Check className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-slate-805 dark:text-slate-200">
                  ✓ No records found
                </h4>
                <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 max-w-sm">
                  All cases are currently within statutory timelines.
                </p>
              </div>

              {/* Mobile Compact Inline Empty State */}
              <div className="md:hidden flex items-center justify-center gap-2 py-3 text-slate-550 dark:text-slate-455 text-xs">
                <Check className="h-4 w-4 text-emerald-555 shrink-0" />
                <span>No records found in this category.</span>
              </div>
            </div>
          ) : (
            renderReportTable(columns, rows, title, fileBase)
          )}
        </CardContent>
      </Card>
    );
  };

  const isDashboardEmpty = 
    filteredOverdue.length === 0 &&
    filteredDueIn7.length === 0 &&
    filteredNoReply.length === 0 &&
    filteredIncomplete.length === 0 &&
    filteredFirstAppeals.length === 0 &&
    filteredSecondAppeals.length === 0 &&
    filteredClosed.length === 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 1. KPI SUMMARY SECTION */}
      <div className="grid gap-2.5 sm:gap-3.5 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {/* Overdue */}
        <button
          onClick={() => scrollToSection("report-overdue")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-rose-450 dark:hover:border-rose-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-rose-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Overdue</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {overdue.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-rose-600 dark:text-rose-400/90 leading-none">
            Requires Action
          </span>
        </button>

        {/* Due in 7 Days */}
        <button
          onClick={() => scrollToSection("report-due-7-days")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-amber-450 dark:hover:border-amber-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-amber-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Due Soon</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-450 shrink-0">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {dueIn7.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-amber-600 dark:text-amber-455/90 leading-none">
            7 Days Pending
          </span>
        </button>

        {/* No Reply */}
        <button
          onClick={() => scrollToSection("report-no-reply")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-blue-450 dark:hover:border-blue-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-blue-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">No Reply</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <MailWarning className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {noReply.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-blue-600 dark:text-blue-400/90 leading-none">
            Past Deadline
          </span>
        </button>

        {/* Incomplete */}
        <button
          onClick={() => scrollToSection("report-incomplete-reply")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-orange-450 dark:hover:border-orange-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-orange-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Incomplete</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-455 shrink-0">
              <MessageSquareWarning className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {incompleteReply.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-orange-600 dark:text-orange-455/90 leading-none">
            Partial Replies
          </span>
        </button>

        {/* First Appeal */}
        <button
          onClick={() => scrollToSection("report-first-appeals")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-purple-455 dark:hover:border-purple-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-purple-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">1st Appeal</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-purple-500/10 text-purple-655 dark:text-purple-400 shrink-0">
              <Scale className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {firstAppealsPending.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-purple-600 dark:text-purple-400/90 leading-none">
            Awaiting FAA
          </span>
        </button>

        {/* Second Appeal */}
        <button
          onClick={() => scrollToSection("report-second-appeals")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-purple-455 dark:hover:border-purple-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-purple-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">2nd Appeal</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-purple-500/10 text-purple-655 dark:text-purple-400 shrink-0">
              <Building className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {secondAppealsPending.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-purple-600 dark:text-purple-400/90 leading-none">
            Commission
          </span>
        </button>

        {/* Closed */}
        <button
          onClick={() => scrollToSection("report-closed")}
          className="text-left p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-emerald-450 dark:hover:border-emerald-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-20 md:h-29 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-emerald-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400">Closed</span>
            <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-455 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {closedThisMonth.length}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-450/90 leading-none">
            This Month
          </span>
        </button>
      </div>

      {/* 2. GLOBAL SEARCH / FILTER TOOLBAR - Sticky Top on Mobile */}
      <div className="sticky top-14 md:top-16 z-20 flex items-center gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 no-print shadow-xs">
        <Search className="h-4.5 w-4.5 text-slate-400 shrink-0 ml-0.5" />
        <Input
          placeholder="Filter reports by reference number, subject, or status..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="h-10 md:h-9 border-slate-200 dark:border-slate-800 dark:bg-slate-950/40 text-sm focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-800 focus-visible:ring-offset-0"
        />
        {globalFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setGlobalFilter("")}
            className="h-10 md:h-9 px-2.5 text-xs text-slate-550 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            Clear
          </Button>
        )}
      </div>

      {/* 3. REPORT CARDS */}
      {isDashboardEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-900/10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-505 dark:text-emerald-450 mb-3 animate-pulse">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h4 className="text-base font-bold text-slate-850 dark:text-slate-100">
            All Systems Nominal — No Actions Pending
          </h4>
          <p className="text-xs text-slate-505 dark:text-slate-400 mt-1 max-w-md leading-normal">
            No report categories contain matching records. All RTI applications, first appeals, and second appeals are currently matching and fully compliant.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setGlobalFilter("");
              router.refresh();
            }}
            className="mt-4 h-9 text-xs font-semibold cursor-pointer border-slate-205 dark:border-slate-805"
          >
            Clear Active Filter
          </Button>
        </div>
      ) : (
        <div className="space-y-3.5 md:space-y-6">
          {/* Overdue */}
          {renderReportCard(
            "report-overdue",
            "Overdue RTIs",
            "RTI applications whose statutory response deadline has already expired without a full reply.",
            filteredOverdue.length,
            RTI_COLUMNS,
            filteredOverdue,
            "rti-overdue",
            "border-l-4 border-l-rose-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-4 w-4" />
            </div>,
          )}

          {/* Due in 7 Days */}
          {renderReportCard(
            "report-due-7-days",
            "Due Within 7 Days",
            "Pending RTI applications whose statutory deadline is approaching within the next 7 days.",
            filteredDueIn7.length,
            RTI_COLUMNS,
            filteredDueIn7,
            "rti-due-7-days",
            "border-l-4 border-l-amber-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
              <Clock className="h-4 w-4" />
            </div>,
          )}

          {/* No Reply Past Deadline */}
          {renderReportCard(
            "report-no-reply",
            "No Reply Past Response Window",
            "Applications which have received no response from the PIO and are past their normal 30-day timeline.",
            filteredNoReply.length,
            RTI_COLUMNS,
            filteredNoReply,
            "rti-no-reply",
            "border-l-4 border-l-blue-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
              <MailWarning className="h-4 w-4" />
            </div>,
          )}

          {/* Incomplete / Partial Reply */}
          {renderReportCard(
            "report-incomplete-reply",
            "Incomplete / Partial Replies",
            "Applications where replies were received, but marked as partial, incomplete, or unsatisfactory.",
            filteredIncomplete.length,
            RTI_COLUMNS,
            filteredIncomplete,
            "rti-incomplete-reply",
            "border-l-4 border-l-orange-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
              <MessageSquareWarning className="h-4 w-4" />
            </div>,
          )}

          {/* First Appeals Pending */}
          {renderReportCard(
            "report-first-appeals",
            "First Appeals Pending FAA Order",
            "First appeals filed by the applicant where a decision order from the First Appellate Authority is still pending.",
            filteredFirstAppeals.length,
            FIRST_FILL_COLS_FOR_CARD(filteredFirstAppeals),
            filteredFirstAppeals,
            "rti-first-appeals-pending",
            "border-l-4 border-l-purple-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
              <Scale className="h-4 w-4" />
            </div>,
          )}

          {/* Second Appeals Pending */}
          {renderReportCard(
            "report-second-appeals",
            "Second Appeals Pending Order",
            "Second appeals escalated to the Information Commission where a final decision order is pending.",
            filteredSecondAppeals.length,
            SECOND_FILL_COLS_FOR_CARD(filteredSecondAppeals),
            filteredSecondAppeals,
            "rti-second-appeals-pending",
            "border-l-4 border-l-purple-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
              <Building className="h-4 w-4" />
            </div>,
          )}

          {/* Closed Cases */}
          {renderReportCard(
            "report-closed",
            "Cases Closed This Month",
            "RTI applications that have been successfully resolved and closed during the current calendar month.",
            filteredClosed.length,
            RTI_COLUMNS,
            filteredClosed,
            "rti-closed-month",
            "border-l-4 border-l-emerald-500",
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>,
          )}
        </div>
      )}

      {/* 4. MODAL DIALOG FOR VIEW ALL */}
      <Dialog
        open={activeDialogSection !== null}
        onOpenChange={(open) => {
          if (!open) setActiveDialogSection(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col rounded-xl overflow-hidden p-0 dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-150 dark:border-slate-800/80 flex flex-row items-center justify-between">
            <DialogTitle className="text-base font-bold text-foreground dark:text-slate-100">
              {activeDialogSection?.title} — Complete Listing
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeDialogSection && (
              <Table className="w-full text-left border-collapse">
                <TableHeader className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-850 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-none">
                    {activeDialogSection.columns.map((c) => (
                      <TableHead
                        key={c.key}
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wider text-slate-505 dark:text-slate-400 py-3",
                          c.key === "actions" && "text-right pr-6",
                        )}
                      >
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDialogSection.rows.map((row, i) => (
                    <TableRow
                      key={i}
                      className="h-14 odd:bg-white dark:odd:bg-slate-900/40 even:bg-slate-50/10 dark:even:bg-slate-950/10 dark:hover:bg-slate-800/40 transition-colors duration-150 ease-out border-b border-slate-200/60 dark:border-slate-800/50"
                    >
                      {activeDialogSection.columns.map((c) => (
                        <TableCell
                          key={c.key}
                          className={cn(
                            "align-middle py-2.5",
                            c.key === "actions" && "text-right pr-6",
                          )}
                        >
                          {renderCell(row, c.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div className="px-6 py-3 border-t border-slate-150 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950 flex justify-between items-center text-xs text-slate-500">
            <span className="dark:text-slate-400">Showing {activeDialogSection?.rows.length} total records</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  activeDialogSection && exportRows(activeDialogSection.rows, activeDialogSection.fileBase, "csv")
                }
                className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  activeDialogSection && exportRows(activeDialogSection.rows, activeDialogSection.fileBase, "xlsx")
                }
                className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Export XLSX
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helpers to get columns for appeals dynamically
const FIRST_FILL_COLS_FOR_CARD = (rows: any[]) => [
  { key: "ref", label: "RTI Ref" },
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "grounds", label: "Grounds" },
  { key: "filed", label: "Filed" },
  { key: "order_due", label: "Order due" },
  { key: "actions", label: "Actions" },
];

const SECOND_FILL_COLS_FOR_CARD = (rows: any[]) => [
  { key: "ref", label: "RTI Ref" },
  { key: "subject", label: "Subject" },
  { key: "status", label: "Status" },
  { key: "commission", label: "Commission" },
  { key: "diary", label: "Diary no." },
  { key: "hearing", label: "Hearing" },
  { key: "actions", label: "Actions" },
];
