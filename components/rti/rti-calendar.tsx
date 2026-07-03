"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  Scale,
  Building,
  CheckCircle2,
  FileText,
  MapPin,
  Building2,
  Calendar as CalendarIcon,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Inbox,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { DeadlineBadge } from "@/components/rti/deadline-badge";
import { RtiStatusBadge } from "@/components/rti/rti-status-badge";
import { activeDeadline, daysBetween } from "@/lib/rti-deadlines";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RtiWithRelations } from "@/lib/types";
import type { DeadlineRules } from "@/lib/constants";

export function RtiCalendar({
  rtis,
  rules,
}: {
  rtis: RtiWithRelations[];
  rules: DeadlineRules;
}) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = React.useState<string>("all");
  const now = React.useMemo(() => new Date(), []);

  // Compute all items with active deadlines
  const allItems = React.useMemo(() => {
    return rtis
      .map((r) => {
        const active = activeDeadline(r, now, rules);
        const days = active ? daysBetween(now, active.due) : null;
        return { rti: r, active, days };
      })
      .filter((x) => x.active)
      .sort((a, b) => (a.active!.due < b.active!.due ? -1 : 1));
  }, [rtis, now, rules]);

  // Executive summary counts
  const overdueCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days < 0).length,
    [allItems]
  );
  const dueTodayCount = React.useMemo(
    () => allItems.filter((x) => x.days === 0).length,
    [allItems]
  );
  const dueThisWeekCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days >= 0 && x.days <= 7).length,
    [allItems]
  );
  const upcomingCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days > 7).length,
    [allItems]
  );
  const repliesCount = React.useMemo(
    () => allItems.filter((x) => x.active!.label.toUpperCase().includes("REPLY")).length,
    [allItems]
  );
  const firstAppealsCount = React.useMemo(
    () => allItems.filter((x) => x.active!.label.toUpperCase().includes("FIRST APPEAL")).length,
    [allItems]
  );
  const secondAppealsCount = React.useMemo(
    () => allItems.filter((x) => x.active!.label.toUpperCase().includes("SECOND APPEAL")).length,
    [allItems]
  );
  const appealsCount = firstAppealsCount + secondAppealsCount;
  const urgentCount = React.useMemo(
    () => allItems.filter((x) => x.rti.priority === "Urgent" || x.rti.is_life_liberty).length,
    [allItems]
  );

  // Filter items based on active quick filter tab
  const quickFilteredItems = React.useMemo(() => {
    return allItems.filter((x) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "overdue") return x.days !== null && x.days < 0;
      if (activeFilter === "today") return x.days === 0;
      if (activeFilter === "due-week") return x.days !== null && x.days >= 0 && x.days <= 7;
      if (activeFilter === "reply") return x.active!.label.toUpperCase().includes("REPLY");
      if (activeFilter === "appeals") return x.active!.label.toUpperCase().includes("APPEAL");
      if (activeFilter === "second-appeal") return x.active!.label.toUpperCase().includes("SECOND APPEAL");
      if (activeFilter === "life-liberty") return x.rti.priority === "Urgent" || x.rti.is_life_liberty;
      return true;
    });
  }, [allItems, activeFilter]);

  // Date and grid generation for calendar
  // Default to the first active deadline or today
  const initialCalendarDate = React.useMemo(() => {
    const firstItem = quickFilteredItems[0];
    const due = firstItem?.active?.due;
    return due ? new Date(due) : new Date();
  }, [quickFilteredItems]);

  const [currentDate, setCurrentDate] = React.useState<Date>(initialCalendarDate);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

  // Sync calendar view month when quick filters change
  React.useEffect(() => {
    const firstItem = quickFilteredItems[0];
    const due = firstItem?.active?.due;
    if (due) {
      setCurrentDate(new Date(due));
    }
  }, [quickFilteredItems]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const cells = React.useMemo(() => {
    const list: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      list.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      list.push(i);
    }
    return list;
  }, [firstDayIndex, totalDays]);

  // Map quick filtered deadlines by their exact YYYY-MM-DD due date
  const deadlinesByDate = React.useMemo(() => {
    const map = new Map<string, typeof quickFilteredItems>();
    for (const item of quickFilteredItems) {
      const key = item.active!.due;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [quickFilteredItems]);

  // Filter list by selectedDate or current active month
  const finalDisplayItems = React.useMemo(() => {
    if (selectedDate) {
      const key = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
      return quickFilteredItems.filter((x) => x.active!.due === key);
    }
    // Show all for active view month if no specific date is selected
    return quickFilteredItems.filter((x) => {
      const d = new Date(x.active!.due);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [quickFilteredItems, selectedDate, year, month]);

  // Group displayed items by due date for the right side timeline
  const displayedGroups = React.useMemo(() => {
    const map = new Map<string, typeof finalDisplayItems>();
    for (const it of finalDisplayItems) {
      const key = it.active!.due;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [finalDisplayItems]);

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
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedDate(null);
              router.refresh();
            }}
            className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900"
          >
            Refresh Calendar
          </Button>
        </div>
      </div>
    );
  };

  const filterChips = [
    { id: "all", label: "All", count: allItems.length },
    { id: "overdue", label: "Overdue", count: overdueCount },
    { id: "today", label: "Today", count: dueTodayCount },
    { id: "due-week", label: "This Week", count: dueThisWeekCount },
    { id: "reply", label: "Replies", count: repliesCount },
    { id: "appeals", label: "Appeals", count: appealsCount },
    { id: "second-appeal", label: "2nd Appeal", count: secondAppealsCount },
    { id: "life-liberty", label: "Life & Liberty", count: urgentCount },
  ];

  // Animation variants
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
      {/* 1. EXECUTIVE SUMMARY BANNER */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl border border-border bg-gradient-to-r from-card via-card to-primary/[0.015] p-6 shadow-2xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> Compliance Deadline Overview
            </h2>
            <p className="text-sm text-foreground/80 leading-relaxed font-semibold">
              Currently monitoring statutory SLA limits for <strong className="text-primary font-black">{rtis.length}</strong> active filings. 
              Review priority actions below categorized by urgency and date context.
            </p>
          </div>
          {/* Summary badging */}
          <div className="flex flex-wrap gap-2 text-xs font-bold shrink-0">
            <span className="bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 px-2.5 py-1 rounded border border-rose-100 dark:border-rose-900/50">
              {overdueCount} Overdue
            </span>
            <span className="bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 px-2.5 py-1 rounded border border-purple-100 dark:border-purple-900/50">
              {appealsCount} Appeals
            </span>
            <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded border border-amber-100 dark:border-amber-900/50">
              {dueTodayCount} Due Today
            </span>
          </div>
        </div>
      </motion.div>

      {/* 2. DEADLINE KPI OVERVIEW */}
      <motion.div
        variants={metricsContainerVariants}
        initial="hidden"
        animate="show"
        className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 no-print"
      >
        {/* Overdue */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => { setActiveFilter("overdue"); setSelectedDate(null); }}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-rose-400 dark:hover:border-rose-800 hover:shadow-xs transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer relative overflow-hidden border-t-2 border-t-rose-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Overdue</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {overdueCount}
          </span>
          <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400/90 leading-none">
            Statutes Breached
          </span>
        </motion.button>

        {/* Due Today */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => { setActiveFilter("today"); setSelectedDate(null); }}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-800 hover:shadow-xs transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer relative overflow-hidden border-t-2 border-t-amber-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Due Today</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {dueTodayCount}
          </span>
          <span className="text-[9.5px] font-bold text-amber-600 dark:text-amber-500/90 leading-none">
            Action Required
          </span>
        </motion.button>

        {/* Due This Week */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => { setActiveFilter("due-week"); setSelectedDate(null); }}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-amber-400 dark:hover:border-amber-800 hover:shadow-xs transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer relative overflow-hidden border-t-2 border-t-amber-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">This Week</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {dueThisWeekCount}
          </span>
          <span className="text-[9.5px] font-bold text-amber-600 dark:text-amber-500/90 leading-none">
            Next 7 Days
          </span>
        </motion.button>

        {/* Appeals */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => { setActiveFilter("appeals"); setSelectedDate(null); }}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-purple-500 dark:hover:border-purple-800 hover:shadow-xs transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer relative overflow-hidden border-t-2 border-t-purple-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Appeals</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 shrink-0">
              <Scale className="h-3.5 w-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {appealsCount}
          </span>
          <span className="text-[9.5px] font-bold text-purple-600 dark:text-purple-400/90 leading-none">
            FAA & Commission
          </span>
        </motion.button>

        {/* Life & Liberty */}
        <motion.button
          variants={metricItemVariants}
          onClick={() => { setActiveFilter("life-liberty"); setSelectedDate(null); }}
          className="text-left p-3.5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 hover:border-rose-500 dark:hover:border-rose-800 hover:shadow-xs transition-all duration-200 flex flex-col justify-between h-24 cursor-pointer relative overflow-hidden border-t-2 border-t-rose-500"
        >
          <div className="flex items-center justify-between gap-1.5 w-full">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Urgent</span>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            </div>
          </div>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {urgentCount}
          </span>
          <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400/90 leading-none">
            Life / Liberty cases
          </span>
        </motion.button>
      </motion.div>

      {/* 3. QUICK TIMELINE FILTERS */}
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-2 no-print border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex items-center bg-slate-100/70 dark:bg-slate-950/50 p-0.5 rounded-xl border dark:border-slate-800/80">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => {
                setActiveFilter(chip.id);
                setSelectedDate(null); // clear date filter on chip toggle
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs transition-all duration-200 cursor-pointer font-bold flex items-center gap-1.5",
                activeFilter === chip.id
                  ? "bg-white dark:bg-slate-800 text-foreground shadow-xs border dark:border-slate-700/60"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              <span>{chip.label}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-extrabold",
                activeFilter === chip.id
                  ? "bg-primary/10 text-primary"
                  : "bg-slate-200/60 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              )}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. TODAY'S PRIORITY PANEL */}
      <div className="bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-bold">
        <div className="flex items-center gap-2 flex-wrap text-foreground/80">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" /> Urgent Tasklist Summary:</span>
          <span className="flex items-center gap-1.5 bg-rose-500/10 text-rose-600 px-2 py-0.5 rounded-md border border-rose-200/40 dark:bg-rose-500/20 dark:text-rose-400"><AlertTriangle className="h-3 w-3" /> {overdueCount} Critical Overdue</span>
          <span className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-md border border-amber-200/40 dark:bg-amber-500/20 dark:text-amber-400"><Clock className="h-3 w-3" /> {dueTodayCount} Due Today</span>
          <span className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-md border border-blue-200/40 dark:bg-blue-500/20 dark:text-blue-400"><FileText className="h-3 w-3" /> {repliesCount} Awaiting Reply</span>
          <span className="flex items-center gap-1.5 bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-md border border-purple-200/40 dark:bg-purple-500/20 dark:text-purple-400"><Scale className="h-3 w-3" /> {firstAppealsCount} First Appeal</span>
        </div>
        {selectedDate && (
          <Button
            variant="link"
            size="sm"
            onClick={() => setSelectedDate(null)}
            className="h-6 text-[11px] font-bold text-primary p-0"
          >
            Clear Selected Date filter
          </Button>
        )}
      </div>

      {/* 5. CALENDAR + AGENDA WORKSPACE (Responsive layouts) */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr]">
        
        {/* Left Column: Compact navigation calendar widget */}
        <div className="space-y-4 md:pr-4 md:border-r border-slate-100 dark:border-slate-800 select-none no-print">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/40 p-4 space-y-4 shadow-2xs">
            {/* Calendar Header Month selectors */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-800/60 pb-2">
              <div className="flex items-center gap-1 min-w-0">
                <Select
                  value={String(month)}
                  onValueChange={(val) => {
                    const m = parseInt(val || "", 10);
                    if (!isNaN(m)) {
                      setCurrentDate(new Date(year, m, 1));
                      setSelectedDate(null);
                    }
                  }}
                >
                  <SelectTrigger className="border-none bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 h-8 px-1.5 text-xs font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-800 dark:text-slate-200 shrink-0">
                    <SelectValue>{currentDate.toLocaleDateString("en-US", { month: "long" })}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {Array.from({ length: 12 }, (_, i) => {
                      const optDate = new Date(2000, i, 1);
                      return (
                        <SelectItem key={i} value={String(i)} className="text-xs">
                          {optDate.toLocaleDateString("en-US", { month: "long" })}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <Select
                  value={String(year)}
                  onValueChange={(val) => {
                    const y = parseInt(val || "", 10);
                    if (!isNaN(y)) {
                      setCurrentDate(new Date(y, month, 1));
                      setSelectedDate(null);
                    }
                  }}
                >
                  <SelectTrigger className="border-none bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 h-8 px-1 text-xs font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-800 dark:text-slate-200 shrink-0">
                    <SelectValue>{year}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    {Array.from({ length: 16 }, (_, i) => {
                      const optYear = new Date().getFullYear() - 5 + i;
                      return (
                        <SelectItem key={optYear} value={String(optYear)} className="text-xs">
                          {optYear}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Prev / Next controls */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={prevMonth}
                  className="h-7 w-7 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4 text-slate-500" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={nextMonth}
                  className="h-7 w-7 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md cursor-pointer"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
            </div>

            {/* Weekday Columns Labels */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pb-1">
              <span>S</span>
              <span>M</span>
              <span>T</span>
              <span>W</span>
              <span>T</span>
              <span>F</span>
              <span>S</span>
            </div>

            {/* Cells */}
            <div className="grid grid-cols-7 gap-y-1 justify-items-center">
              {cells.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-8 w-8" />;
                }

                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayDeadlines = deadlinesByDate.get(dateStr) || [];
                const hasDeadlines = dayDeadlines.length > 0;
                
                const hasOverdue = dayDeadlines.some(x => x.days !== null && x.days < 0);
                const hasAppeals = dayDeadlines.some(x => x.active!.label.toUpperCase().includes("APPEAL"));

                const dayIsSelected = selectedDate &&
                  selectedDate.getFullYear() === year &&
                  selectedDate.getMonth() === month &&
                  selectedDate.getDate() === day;

                const isToday = now.getDate() === day &&
                  now.getMonth() === month &&
                  now.getFullYear() === year;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => {
                      const clicked = new Date(year, month, day);
                      if (selectedDate && selectedDate.toDateString() === clicked.toDateString()) {
                        setSelectedDate(null);
                      } else {
                        setSelectedDate(clicked);
                      }
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 cursor-pointer relative"
                  >
                    <span
                      className={cn(
                        "h-7 w-7 flex items-center justify-center rounded-full transition-all duration-150 relative",
                        dayIsSelected
                          ? "bg-primary text-primary-foreground font-black shadow-sm scale-105"
                          : isToday
                          ? "ring-2 ring-primary ring-offset-1 dark:ring-offset-slate-900 font-bold"
                          : hasDeadlines
                          ? "border border-slate-300 dark:border-slate-700 bg-slate-50/20 text-slate-800 dark:text-slate-100 font-bold"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
                      )}
                    >
                      {day}
                      {/* Indication Dot triggers */}
                      {hasDeadlines && !dayIsSelected && (
                        <span className={cn(
                          "absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full",
                          hasOverdue ? "bg-rose-500 animate-pulse" : hasAppeals ? "bg-purple-500" : "bg-blue-500"
                        )} />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Deadlines Timeline Agenda Workspace */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b pb-2.5 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-slate-400" />
              {selectedDate ? (
                <span>Deadlines: {formatDate(selectedDate.toISOString().slice(0, 10))}</span>
              ) : (
                <span>Agenda: {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              )}
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border dark:border-slate-700">
              {finalDisplayItems.length} {finalDisplayItems.length === 1 ? "action item" : "action items"}
            </span>
          </div>

          {finalDisplayItems.length === 0 ? (
            renderEmptyState(
              "No Scheduled Deadlines",
              selectedDate 
                ? "There are no statutory deadlines scheduled for this specific day."
                : `There are no deadlines scheduled in ${currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`,
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            )
          ) : (
            /* Agenda Timeline style list */
            <div className="relative border-l border-slate-200 dark:border-slate-800/80 ml-3 pl-5 space-y-6 py-2">
              {displayedGroups.map(([date, group]) => {
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                return (
                  <div key={date} className="relative space-y-3">
                    {/* Connective Timeline Circle Dot */}
                    <div className="absolute -left-[27.5px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 shadow-2xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </div>

                    {/* Timeline Date labels */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {formatDate(date)}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {dayName}
                      </span>
                    </div>

                    {/* Timeline Cards Container */}
                    <div className="space-y-3 pl-0.5">
                      {group.map(({ rti, active, days }) => {
                        let borderCls = "border-l-4 border-l-blue-500";
                        if (active!.bucket === "overdue" || active!.bucket === "critical-overdue" || (days !== null && days < 0)) {
                          borderCls = "border-l-4 border-l-rose-500";
                        } else if (days !== null && days <= 7) {
                          borderCls = "border-l-4 border-l-amber-500";
                        } else if (days !== null && days > 7) {
                          borderCls = "border-l-4 border-l-emerald-500";
                        }

                        return (
                          <Card
                            key={rti.id}
                            className={cn(
                              "overflow-hidden border border-slate-200 bg-white shadow-3xs rounded-xl hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700/80 transition-all duration-200 group hover:shadow-2xs",
                              borderCls,
                            )}
                          >
                            <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              {/* Document Details Block */}
                              <div className="flex items-start gap-3 min-w-0 flex-1">
                                <div className="mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shadow-3xs">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/rti/${rti.id}`}>
                                    <p className="font-bold text-sm text-foreground/90 dark:text-slate-100 group-hover:text-primary transition-colors leading-snug line-clamp-1 cursor-pointer">
                                      {rti.subject}
                                    </p>
                                  </Link>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                    <span className="font-mono text-slate-500">{rti.internal_ref ?? "—"}</span>
                                    {rti.ward && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5">
                                          <MapPin className="h-3 w-3 text-slate-400" />
                                          Ward {rti.ward.new_no}
                                        </span>
                                      </>
                                    )}
                                    {rti.public_authority && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 truncate max-w-[140px] sm:max-w-[200px]">
                                          <Building2 className="h-3 w-3 text-slate-400" />
                                          {rti.public_authority}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Badging & Quick Detail actions */}
                              <div className="flex items-center justify-between lg:justify-end gap-2.5 pt-2 lg:pt-0 border-t border-slate-50 lg:border-t-0 dark:border-slate-800 mt-1 lg:mt-0 shrink-0">
                                <div className="flex items-center gap-2">
                                  <RtiStatusBadge status={rti.status} />
                                  <DeadlineBadge rti={rti} rules={rules} />
                                </div>
                                <Link href={`/rti/${rti.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary flex items-center justify-center cursor-pointer"
                                    aria-label="View RTI details"
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
