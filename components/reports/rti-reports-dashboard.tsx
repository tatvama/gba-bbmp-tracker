"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  RotateCw,
  TrendingUp,
  Filter,
  ArrowRight,
  Printer,
  FileDown,
  Info,
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
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
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
  const [categoryFilter, setCategoryFilter] = React.useState<"all" | "critical" | "pending" | "appeals" | "completed">("all");
  const [activeDialogSection, setActiveDialogSection] = React.useState<{
    title: string;
    columns: { key: string; label: string }[];
    rows: any[];
    fileBase: string;
  } | null>(null);
  const [expandedSection, setExpandedSection] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState("group-critical");
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

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

  // 7. Formal Complaints Filed (Section 18) — status has no statutory deadline
  // and no dedicated join table, so it needs its own bucket or it silently
  // disappears from every other section on this page.
  const complaintsFiled = React.useMemo(() => {
    return rtis.filter((r) => r.status === "Complaint Filed").map(mapRtiRow);
  }, [rtis, mapRtiRow]);

  // 8. Closed This Month
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
  const filterRows = React.useCallback(
    <T extends Record<string, any>>(rows: T[]): T[] => {
      if (!globalFilter.trim()) return rows;
      const q = globalFilter.toLowerCase();
      return rows.filter(
        (r) =>
          (r.ref && r.ref.toLowerCase().includes(q)) ||
          (r.subject && r.subject.toLowerCase().includes(q)) ||
          (r.status && r.status.toLowerCase().includes(q)),
      );
    },
    [globalFilter],
  );

  const filteredOverdue = React.useMemo(() => filterRows(overdue), [overdue, filterRows]);
  const filteredDueIn7 = React.useMemo(() => filterRows(dueIn7), [dueIn7, filterRows]);
  const filteredNoReply = React.useMemo(() => filterRows(noReply), [noReply, filterRows]);
  const filteredIncomplete = React.useMemo(() => filterRows(incompleteReply), [incompleteReply, filterRows]);
  const filteredFirstAppeals = React.useMemo(() => filterRows(firstAppealsPending), [firstAppealsPending, filterRows]);
  const filteredSecondAppeals = React.useMemo(() => filterRows(secondAppealsPending), [secondAppealsPending, filterRows]);
  const filteredComplaintsFiled = React.useMemo(() => filterRows(complaintsFiled), [complaintsFiled, filterRows]);
  const filteredClosed = React.useMemo(() => filterRows(closedThisMonth), [closedThisMonth, filterRows]);

  // Total results count matching all filters
  const totalFilteredCount = React.useMemo(() => {
    let count = 0;
    if (categoryFilter === "all" || categoryFilter === "critical") {
      count += filteredOverdue.length + filteredDueIn7.length;
    }
    if (categoryFilter === "all" || categoryFilter === "pending") {
      count += filteredNoReply.length + filteredIncomplete.length;
    }
    if (categoryFilter === "all" || categoryFilter === "appeals") {
      count += filteredFirstAppeals.length + filteredSecondAppeals.length + filteredComplaintsFiled.length;
    }
    if (categoryFilter === "all" || categoryFilter === "completed") {
      count += filteredClosed.length;
    }
    return count;
  }, [
    categoryFilter,
    filteredOverdue,
    filteredDueIn7,
    filteredNoReply,
    filteredIncomplete,
    filteredFirstAppeals,
    filteredSecondAppeals,
    filteredComplaintsFiled,
    filteredClosed,
  ]);

  // Set up Scroll Spy
  React.useEffect(() => {
    const sections = ["group-critical", "group-pending", "group-appeals", "group-completed"];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        const firstVisible = visible[0];
        if (firstVisible) {
          setActiveSection(firstVisible.target.id);
        }
      },
      { rootMargin: "-120px 0px -50% 0px", threshold: 0.1 }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categoryFilter]);

  // Scroll helper
  const scrollToSection = (id: string) => {
    setCategoryFilter("all");
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
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
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:text-slate-400 dark:hover:text-primary dark:hover:bg-slate-800 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={handleViewDetails}
                  aria-label="View Details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p className="text-[11px] font-medium">View Details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    }

    if (colKey === "ref") {
      return <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 font-bold tracking-tight">{val || "—"}</span>;
    }

    if (colKey === "subject") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-semibold text-sm text-foreground/90 dark:text-slate-100 hover:text-primary dark:hover:text-primary transition-colors line-clamp-1 cursor-help max-w-sm leading-relaxed">
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
      return <RtiStatusBadge status={val} />;
    }

    if (colKey === "due" && row.raw) {
      return <DeadlineBadge rti={row.raw} rules={rules} />;
    }

    return <span className="text-xs text-muted-foreground font-semibold">{val ?? "—"}</span>;
  };

  // Redesigned empty states with high visual fidelity
  const renderEmptyState = (title: string, description: string, icon: React.ReactNode) => {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl bg-slate-50/20 dark:bg-slate-900/10 transition-all duration-300">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mb-3 shadow-xs">
          {icon}
        </div>
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          {title}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm leading-relaxed font-medium">
          {description}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900"
          >
            <Link href="/rti/new">
              Create Case
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-8 text-xs font-semibold"
          >
            Refresh Ledger
          </Button>
        </div>
      </div>
    );
  };

  const renderReportTable = (
    columns: { key: string; label: string }[],
    rows: any[],
    sectionTitle: string,
    fileBase: string,
  ) => {
    const previewRows = rows.slice(0, 5);

    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-900/40 shadow-2xs">
          <Table className="w-full text-left border-collapse">
            <TableHeader className="bg-slate-50/50 dark:bg-slate-950/40 border-b border-slate-200/80 dark:border-slate-800/80">
              <TableRow className="hover:bg-transparent border-none">
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 py-3",
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
                  className="h-14 hover:bg-slate-50/60 dark:hover:bg-slate-900/60 transition-all duration-200 ease-out border-b border-slate-200/60 dark:border-slate-800/40 last:border-none"
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn("align-middle py-2", c.key === "actions" && "text-right pr-6")}
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
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setActiveDialogSection({ title: sectionTitle, columns, rows, fileBase })
              }
              className="text-xs font-bold px-4 h-8 gap-1.5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg shadow-sm"
            >
              <Eye className="h-3.5 w-3.5 opacity-70" /> View Complete Registry ({rows.length})
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
    statsPanel?: React.ReactNode,
  ) => {
    const isExpanded = expandedSection === id;

    return (
      <Card
        id={id}
        className={cn(
          "overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl transition-all duration-300 scroll-mt-28 hover:shadow-xs",
          accentClass,
        )}
      >
        {/* Mobile Accordion Toggle Header */}
        <button
          type="button"
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          className="w-full flex items-center justify-between p-4 text-left md:hidden cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="shrink-0 scale-90">{icon}</div>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate">{title}</span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border dark:border-slate-700 shrink-0">
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
                <CardTitle className="text-base font-bold text-foreground dark:text-slate-100">{title}</CardTitle>
                <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border dark:border-slate-700/80">
                  {count}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-xl font-medium">{description}</p>
              {statsPanel && <div className="mt-3">{statsPanel}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  className="h-8 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 rounded-lg cursor-pointer gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800 min-w-[140px]">
                <DropdownMenuItem onClick={() => handleExport("csv", rows, fileBase)} className="cursor-pointer text-xs font-semibold">
                  <FileDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", rows, fileBase)} className="cursor-pointer text-xs font-semibold">
                  <FileDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", rows, fileBase)} className="cursor-pointer text-xs font-semibold">
                  <Printer className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Print / PDF
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
          <p className="md:hidden text-xs text-slate-500 dark:text-slate-400 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800/60 leading-relaxed font-medium">
            {description}
          </p>

          {/* Mobile Dropdown Options inside content */}
          <div className="md:hidden flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/60">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-500">Actions:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length === 0}
                  className="h-8 px-2.5 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900 rounded-lg cursor-pointer gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                <DropdownMenuItem onClick={() => handleExport("csv", rows, fileBase)} className="cursor-pointer text-xs">
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("xlsx", rows, fileBase)} className="cursor-pointer text-xs">
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf", rows, fileBase)} className="cursor-pointer text-xs">
                  Print / PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {rows.length === 0 ? (
            renderEmptyState("All Systems Nominal", "No pending records found in this categorization.", <Check className="h-5 w-5 text-emerald-500" />)
          ) : (
            renderReportTable(columns, rows, title, fileBase)
          )}
        </CardContent>
      </Card>
    );
  };

  // Executive Compliance summary statistics computations
  const totalRtisCount = rtis.length;
  const criticalCount = overdue.length + dueIn7.length;
  const pendingCount = noReply.length + incompleteReply.length;
  const appealsCount = firstAppealsPending.length + secondAppealsPending.length + complaintsFiled.length;
  const closedCount = rtis.filter(r => r.status === "Closed").length;
  const complianceRate = totalRtisCount ? Math.round((closedCount / totalRtisCount) * 100) : 100;

  // Variants for Staggered animations
  const metricsContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const metricItemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 15 }
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. EXECUTIVE SUMMARY & VISUAL OVERVIEW */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Summary Description Card */}
        <div className="md:col-span-2 rounded-2xl border border-border bg-gradient-to-r from-card via-card to-primary/[0.01] p-6 shadow-2xs space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> Executive Compliance Summary
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed font-semibold">
              The platform is monitoring <strong className="text-primary font-black">{totalRtisCount}</strong> statutory RTI filings across Bengaluru&apos;s municipal jurisdictions. 
              Currently, <strong className="text-rose-500 font-extrabold">{criticalCount}</strong> cases require immediate intervention due to SLA breaches, 
              while <strong className="text-purple-600 font-extrabold">{appealsCount}</strong> files are active in appeals before the FAA and Information Commission.
            </p>
          </div>

          {/* Staggered progress indicator bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted-foreground">General SLA Compliance Index</span>
              <span className={cn(
                complianceRate >= 80 ? "text-emerald-600" : complianceRate >= 50 ? "text-amber-600" : "text-rose-600"
              )}>
                {complianceRate}% compliance
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden border dark:border-slate-800/80">
              <div
                style={{ width: `${complianceRate}%` }}
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
                title={`Closed: ${complianceRate}%`}
              />
              <div
                style={{ width: `${totalRtisCount ? Math.round((pendingCount / totalRtisCount) * 100) : 0}%` }}
                className="bg-blue-500 h-full transition-all duration-500"
                title={`Pending: ${pendingCount}`}
              />
              <div
                style={{ width: `${totalRtisCount ? Math.round((criticalCount / totalRtisCount) * 100) : 0}%` }}
                className="bg-rose-500 h-full transition-all duration-500"
                title={`Critical: ${criticalCount}`}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[10px] font-bold text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Resolved ({closedCount})</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> In-Progress ({pendingCount})</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> SLA Overdue ({overdue.length})</span>
            </div>
          </div>
        </div>

        {/* Visual Priority Guide Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-indigo-500" /> Priority Index Guidance
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              Statutory timeline tracking follows the RTI Act of 2005. Action items are prioritized by severity:
            </p>
          </div>
          <div className="space-y-2 pt-3 text-[11px] font-bold">
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-rose-600 dark:text-rose-400">1. Critical SLA Breach</span>
              <span className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/50">Immediate</span>
            </div>
            <div className="flex items-center justify-between border-b pb-1.5">
              <span className="text-blue-600 dark:text-blue-400">2. Pending Replies</span>
              <span className="bg-blue-50 dark:bg-blue-950/20 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/50">Escalate</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-purple-600 dark:text-purple-400">3. Active Appeals</span>
              <span className="bg-purple-50 dark:bg-purple-950/20 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100 dark:border-purple-900/50">Track FAA</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. REPORT OVERVIEW METRICS (Staggered spring animations) */}
      <motion.div
        variants={metricsContainerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7"
      >
        {/* Overdue */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-overdue")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-rose-400 dark:hover:border-rose-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-rose-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Overdue</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {overdue.length}
          </span>
          <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400/90 leading-none">
            SLA Breached
          </span>
        </motion.button>

        {/* Due in 7 Days */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-due-7-days")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-amber-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Due Soon</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {dueIn7.length}
          </span>
          <span className="text-[9.5px] font-bold text-amber-600 dark:text-amber-500/90 leading-none">
            Next 7 Days
          </span>
        </motion.button>

        {/* No Reply */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-no-reply")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-blue-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">No Reply</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <MailWarning className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {noReply.length}
          </span>
          <span className="text-[9.5px] font-bold text-blue-600 dark:text-blue-400/90 leading-none">
            No PIO Reply
          </span>
        </motion.button>

        {/* Incomplete */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-incomplete-reply")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-orange-400 dark:hover:border-orange-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-orange-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Incomplete</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-500 shrink-0">
              <MessageSquareWarning className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {incompleteReply.length}
          </span>
          <span className="text-[9.5px] font-bold text-orange-600 dark:text-orange-500/90 leading-none">
            Partial / Gap
          </span>
        </motion.button>

        {/* First Appeal */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-first-appeals")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-purple-500 dark:hover:border-purple-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-purple-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">1st Appeal</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 shrink-0">
              <Scale className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {firstAppealsPending.length}
          </span>
          <span className="text-[9.5px] font-bold text-purple-600 dark:text-purple-400/90 leading-none">
            FAA Awaiting
          </span>
        </motion.button>

        {/* Second Appeal */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-second-appeals")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-purple-500 dark:hover:border-purple-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-purple-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">2nd Appeal</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 shrink-0">
              <Building className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {secondAppealsPending.length}
          </span>
          <span className="text-[9.5px] font-bold text-purple-600 dark:text-purple-400/90 leading-none">
            Commission
          </span>
        </motion.button>

        {/* Closed */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => scrollToSection("report-closed")}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-800 hover:shadow-xs dark:hover:shadow-md transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none relative overflow-hidden border-t-2 border-t-emerald-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Closed</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {closedThisMonth.length}
          </span>
          <span className="text-[9.5px] font-bold text-emerald-600 dark:text-emerald-400/90 leading-none">
            This Month
          </span>
        </motion.button>
      </motion.div>

      {/* 3. STICKY REPORT NAVIGATION BAR (Scroll-spy highlighting) */}
      <div className="sticky top-14 z-30 bg-card/90 backdrop-blur-md border-y border-border/80 px-4 py-2 flex items-center justify-between overflow-x-auto whitespace-nowrap scrollbar-none no-print shadow-3xs -mx-4 sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center gap-1.5 md:gap-3.5 text-xs font-bold select-none">
          <button
            onClick={() => scrollToSection("group-critical")}
            className={cn(
              "px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer",
              activeSection === "group-critical"
                ? "bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 font-extrabold"
                : "text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            Critical Reports ({overdue.length + dueIn7.length})
          </button>
          <button
            onClick={() => scrollToSection("group-pending")}
            className={cn(
              "px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer",
              activeSection === "group-pending"
                ? "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-extrabold"
                : "text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            Pending Reports ({noReply.length + incompleteReply.length})
          </button>
          <button
            onClick={() => scrollToSection("group-appeals")}
            className={cn(
              "px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer",
              activeSection === "group-appeals"
                ? "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 font-extrabold"
                : "text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            Appeals ({firstAppealsPending.length + secondAppealsPending.length + complaintsFiled.length})
          </button>
          <button
            onClick={() => scrollToSection("group-completed")}
            className={cn(
              "px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer",
              activeSection === "group-completed"
                ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 font-extrabold"
                : "text-slate-500 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            Completed Reports ({closedThisMonth.length})
          </button>
        </div>
      </div>

      {/* 4. UNIFIED SEARCH & FILTER TOOLBAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/80 no-print shadow-2xs">
        {/* Search Input bar */}
        <div className="flex items-center gap-2.5 flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 shrink-0 ml-0.5" />
          <Input
            placeholder="Search Reference, Subject, or Status..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 border-slate-200 dark:border-slate-800 dark:bg-slate-950/40 text-xs focus-visible:ring-2 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-800 focus-visible:ring-offset-0"
          />
          {globalFilter && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setGlobalFilter("")}
              className="h-8 w-8 text-slate-400 hover:text-foreground rounded-lg cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Quick Filter buttons and action triggers */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Filter Group:
          </span>
          <div className="flex items-center bg-slate-100/70 dark:bg-slate-950/50 p-0.5 rounded-lg border dark:border-slate-800/80">
            {(["all", "critical", "pending", "appeals", "completed"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setCategoryFilter(filter)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] capitalize transition-all duration-200 cursor-pointer font-bold",
                  categoryFilter === filter
                    ? "bg-white dark:bg-slate-800 text-foreground shadow-xs border dark:border-slate-700/60"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          {/* Refresh Action Trigger */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Refresh Ledger"
            className="h-9 w-9 rounded-lg border-slate-200 dark:border-slate-800 cursor-pointer"
          >
            <RotateCw className={cn("h-4 w-4 text-slate-500", isRefreshing && "animate-spin")} />
          </Button>

          {/* Results Count Badge */}
          <div className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700/80 text-[11px] font-bold text-slate-500">
            {totalFilteredCount} matching
          </div>
        </div>
      </div>

      {/* Active Filter Pills if Filter is applied */}
      {(categoryFilter !== "all" || globalFilter) && (
        <div className="flex flex-wrap items-center gap-1.5 no-print text-[11px] font-extrabold text-slate-500">
          <span>Active Filters:</span>
          {categoryFilter !== "all" && (
            <span className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md">
              Group: {categoryFilter}
              <button onClick={() => setCategoryFilter("all")} className="hover:text-rose-500 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {globalFilter && (
            <span className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md max-w-xs truncate">
              Query: &quot;{globalFilter}&quot;
              <button onClick={() => setGlobalFilter("")} className="hover:text-rose-500 cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setCategoryFilter("all");
              setGlobalFilter("");
            }}
            className="text-xs text-primary hover:underline cursor-pointer ml-1"
          >
            Clear All
          </button>
        </div>
      )}

      {/* 5. DYNAMIC GROUPED SECTIONS PANEL */}
      {totalFilteredCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800/80 rounded-2xl bg-slate-50/20 dark:bg-slate-900/10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 mb-4 animate-pulse">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
            No Matching Action Items Found
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-normal font-medium">
            Try adjusting your search criteria or changing your category filters. Currently, all cases in this criteria are nominal.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setGlobalFilter("");
              setCategoryFilter("all");
              router.refresh();
            }}
            className="mt-4 h-9 text-xs font-bold cursor-pointer border-slate-200 dark:border-slate-800"
          >
            Clear Search & Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* A. CRITICAL REPORTS */}
          {(categoryFilter === "all" || categoryFilter === "critical") && (
            <motion.div
              id="group-critical"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b pb-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  Critical SLA Audits
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100/50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border dark:border-rose-900/50 ml-auto">
                  {filteredOverdue.length + filteredDueIn7.length} active
                </span>
              </div>
              <div className="grid gap-6">
                {renderReportCard(
                  "report-overdue",
                  "Overdue RTI Applications",
                  "RTI applications whose statutory 30-day response deadline has expired without a full public response from the PIO.",
                  filteredOverdue.length,
                  RTI_COLUMNS,
                  filteredOverdue,
                  "rti-overdue",
                  "border-l-4 border-l-rose-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
                    <AlertTriangle className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 px-2 py-1 rounded border border-rose-100/80 dark:border-rose-900/50">
                    <Info className="h-3 w-3" /> Active SLA timeline breaches. First Appeal filing window is open.
                  </div>
                )}
                {renderReportCard(
                  "report-due-7-days",
                  "Due Within 7 Days",
                  "Pending RTI applications whose statutory SLA response deadline is approaching within the next 7 days.",
                  filteredDueIn7.length,
                  RTI_COLUMNS,
                  filteredDueIn7,
                  "rti-due-7-days",
                  "border-l-4 border-l-amber-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Clock className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-amber-600 bg-amber-50/50 dark:bg-amber-950/20 px-2 py-1 rounded border border-amber-100/80 dark:border-amber-900/50">
                    <Info className="h-3 w-3" /> Approaching timeline limit. Verify if response has been received.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* B. PENDING REPORTS */}
          {(categoryFilter === "all" || categoryFilter === "pending") && (
            <motion.div
              id="group-pending"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b pb-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  Pending Reports & Gaps
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border dark:border-blue-900/50 ml-auto">
                  {filteredNoReply.length + filteredIncomplete.length} active
                </span>
              </div>
              <div className="grid gap-6">
                {renderReportCard(
                  "report-no-reply",
                  "No Reply Past 30-Day Response Window",
                  "Applications which have received no reply from the PIO and are past their initial 30-day timeline.",
                  filteredNoReply.length,
                  RTI_COLUMNS,
                  filteredNoReply,
                  "rti-no-reply",
                  "border-l-4 border-l-blue-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <MailWarning className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-blue-500 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded border border-blue-100/80 dark:border-blue-900/50">
                    <Info className="h-3 w-3" /> PIO has missed initial response window. Prepare appeal ledger docs.
                  </div>
                )}
                {renderReportCard(
                  "report-incomplete-reply",
                  "Incomplete / Partial Replies",
                  "Applications where replies were received, but marked as partial, incomplete, or unsatisfactory.",
                  filteredIncomplete.length,
                  RTI_COLUMNS,
                  filteredIncomplete,
                  "rti-incomplete-reply",
                  "border-l-4 border-l-orange-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                    <MessageSquareWarning className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-orange-500 bg-orange-50/50 dark:bg-orange-950/20 px-2 py-1 rounded border border-orange-100/80 dark:border-orange-900/50">
                    <Info className="h-3 w-3" /> Information provided is incomplete. Eligible for First Appeal.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* C. APPEALS */}
          {(categoryFilter === "all" || categoryFilter === "appeals") && (
            <motion.div
              id="group-appeals"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b pb-2">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Active Appeal Registries
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100/50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border dark:border-purple-900/50 ml-auto">
                  {filteredFirstAppeals.length + filteredSecondAppeals.length + filteredComplaintsFiled.length} active
                </span>
              </div>
              <div className="grid gap-6">
                {renderReportCard(
                  "report-first-appeals",
                  "First Appeals Pending FAA Order",
                  "First appeals filed by the applicant where a decision order from the First Appellate Authority is still pending.",
                  filteredFirstAppeals.length,
                  FIRST_FILL_COLS_FOR_CARD(filteredFirstAppeals),
                  filteredFirstAppeals,
                  "rti-first-appeals-pending",
                  "border-l-4 border-l-purple-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <Scale className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-purple-500 bg-purple-50/50 dark:bg-purple-950/20 px-2 py-1 rounded border border-purple-100/80 dark:border-purple-900/50">
                    <Info className="h-3 w-3" /> Awaiting FAA order (SLA: 30-45 days). Monitor hearing notices.
                  </div>
                )}
                {renderReportCard(
                  "report-second-appeals",
                  "Second Appeals Pending Order",
                  "Second appeals escalated to the Information Commission where a final decision order is pending.",
                  filteredSecondAppeals.length,
                  SECOND_FILL_COLS_FOR_CARD(filteredSecondAppeals),
                  filteredSecondAppeals,
                  "rti-second-appeals-pending",
                  "border-l-4 border-l-purple-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <Building className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-purple-500 bg-purple-50/50 dark:bg-purple-950/20 px-2 py-1 rounded border border-purple-100/80 dark:border-purple-900/50">
                    <Info className="h-3 w-3" /> Awaiting Information Commission listing. Keep diary numbers handy.
                  </div>
                )}
                {renderReportCard(
                  "report-complaints-filed",
                  "Formal Complaints Filed (Section 18)",
                  "RTI cases escalated to a formal non-compliance complaint before the Information Commission after the appeals track concluded. No statutory deadline applies here — track hearing notices manually.",
                  filteredComplaintsFiled.length,
                  RTI_COLUMNS,
                  filteredComplaintsFiled,
                  "rti-complaints-filed",
                  "border-l-4 border-l-purple-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                    <FileText className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-purple-500 bg-purple-50/50 dark:bg-purple-950/20 px-2 py-1 rounded border border-purple-100/80 dark:border-purple-900/50">
                    <Info className="h-3 w-3" /> No SLA tracked. Monitor Commission hearing notices directly.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* D. COMPLETED REPORTS */}
          {(categoryFilter === "all" || categoryFilter === "completed") && (
            <motion.div
              id="group-completed"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b pb-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Resolved registries
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100/50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border dark:border-emerald-900/50 ml-auto">
                  {filteredClosed.length} active
                </span>
              </div>
              <div>
                {renderReportCard(
                  "report-closed",
                  "Cases Closed This Month",
                  "RTI applications that have been successfully resolved and closed during the current calendar month.",
                  filteredClosed.length,
                  RTI_COLUMNS,
                  filteredClosed,
                  "rti-closed-month",
                  "border-l-4 border-l-emerald-500",
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>,
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 px-2 py-1 rounded border border-emerald-100/80 dark:border-emerald-900/50">
                    <Info className="h-3 w-3" /> Resolved and audited. Information captured and archived successfully.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* 6. MODAL DIALOG FOR VIEW ALL */}
      <Dialog
        open={activeDialogSection !== null}
        onOpenChange={(open) => {
          if (!open) setActiveDialogSection(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col rounded-xl overflow-hidden p-0 dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-row items-center justify-between">
            <DialogTitle className="text-base font-bold text-foreground dark:text-slate-100">
              {activeDialogSection?.title} — Complete Listing
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeDialogSection && (
              <Table className="w-full text-left border-collapse">
                <TableHeader className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-none">
                    {activeDialogSection.columns.map((c) => (
                      <TableHead
                        key={c.key}
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 py-3",
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
          <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950 flex justify-between items-center text-xs text-slate-500">
            <span className="dark:text-slate-400 font-semibold">Showing {activeDialogSection?.rows.length} total records</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  activeDialogSection && exportRows(activeDialogSection.rows, activeDialogSection.fileBase, "csv")
                }
                className="h-8 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 gap-1"
              >
                <Download className="h-3 w-3" /> Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  activeDialogSection && exportRows(activeDialogSection.rows, activeDialogSection.fileBase, "xlsx")
                }
                className="h-8 text-xs font-bold dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 gap-1"
              >
                <Download className="h-3 w-3" /> Export XLSX
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
