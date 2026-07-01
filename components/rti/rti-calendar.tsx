"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Calendar,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Folder,
  Construction,
  Droplet,
  Trash2,
  Lightbulb,
  Briefcase
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

  // Summary counts
  const overdueCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days < 0).length,
    [allItems],
  );
  const dueThisWeekCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days >= 0 && x.days <= 7).length,
    [allItems],
  );
  const upcomingCount = React.useMemo(
    () => allItems.filter((x) => x.days !== null && x.days > 7).length,
    [allItems],
  );
  const firstAppealsCount = React.useMemo(
    () => allItems.filter((x) => x.active!.label.toUpperCase().includes("FIRST APPEAL")).length,
    [allItems],
  );
  const secondAppealsCount = React.useMemo(
    () => allItems.filter((x) => x.active!.label.toUpperCase().includes("SECOND APPEAL")).length,
    [allItems],
  );

  // Filter items based on header quick filters
  const quickFilteredItems = React.useMemo(() => {
    return allItems.filter((x) => {
      if (activeFilter === "all") return true;
      if (activeFilter === "overdue") return x.days !== null && x.days < 0;
      if (activeFilter === "due-week") return x.days !== null && x.days >= 0 && x.days <= 7;
      if (activeFilter === "reply") return x.active!.label.toUpperCase().includes("REPLY");
      if (activeFilter === "first-appeal") return x.active!.label.toUpperCase().includes("FIRST APPEAL");
      if (activeFilter === "second-appeal") return x.active!.label.toUpperCase().includes("SECOND APPEAL");
      if (activeFilter === "life-liberty") return x.rti.priority === "Urgent";
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

  const filterChips = [
    { id: "all", label: "All Deadlines", count: allItems.length },
    { id: "overdue", label: "Overdue", count: overdueCount },
    { id: "due-week", label: "Due This Week", count: dueThisWeekCount },
    { id: "reply", label: "Replies", count: allItems.filter(x => x.active!.label.toUpperCase().includes("REPLY")).length },
    { id: "first-appeal", label: "First Appeal", count: firstAppealsCount },
    { id: "second-appeal", label: "Second Appeal", count: secondAppealsCount },
    { id: "life-liberty", label: "Life & Liberty", count: allItems.filter(x => x.rti.priority === "Urgent").length },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 1. DASHBOARD SUMMARY BAR */}
      <div className="grid gap-2.5 sm:gap-3.5 grid-cols-2 md:grid-cols-5 no-print">
        {/* Overdue */}
        <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-20 md:h-24 border-t-2 border-t-rose-500 hover:shadow-sm hover:scale-[1.01] transition-all duration-150">
          <div className="flex items-center justify-between gap-1.5 text-rose-600">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Overdue</span>
            <AlertTriangle className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
          </div>
          <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {overdueCount}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-rose-650 dark:text-rose-400">
            Action needed
          </span>
        </div>

        {/* Due This Week */}
        <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-20 md:h-24 border-t-2 border-t-amber-500 hover:shadow-sm hover:scale-[1.01] transition-all duration-150">
          <div className="flex items-center justify-between gap-1.5 text-amber-600">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Due This Week</span>
            <Clock className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
          </div>
          <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {dueThisWeekCount}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-amber-600 dark:text-amber-455">
            Requires attention
          </span>
        </div>

        {/* Upcoming */}
        <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-20 md:h-24 border-t-2 border-t-emerald-500 hover:shadow-sm hover:scale-[1.01] transition-all duration-150">
          <div className="flex items-center justify-between gap-1.5 text-emerald-600">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">Upcoming</span>
            <Calendar className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
          </div>
          <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {upcomingCount}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-455">
            Within timeline
          </span>
        </div>

        {/* First Appeals */}
        <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-20 md:h-24 border-t-2 border-t-purple-500 hover:shadow-sm hover:scale-[1.01] transition-all duration-150">
          <div className="flex items-center justify-between gap-1.5 text-purple-600">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">1st Appeals</span>
            <Scale className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
          </div>
          <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {firstAppealsCount}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-purple-600 dark:text-purple-400">
            FAA Level
          </span>
        </div>

        {/* Second Appeals */}
        <div className="p-3 md:p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-20 md:h-24 border-t-2 border-t-purple-500 hover:shadow-sm hover:scale-[1.01] transition-all duration-150">
          <div className="flex items-center justify-between gap-1.5 text-purple-600">
            <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">2nd Appeals</span>
            <Building className="h-3.5 w-3.5 md:h-4.5 md:w-4.5" />
          </div>
          <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none">
            {secondAppealsCount}
          </span>
          <span className="text-[9px] md:text-[9.5px] font-semibold text-purple-600 dark:text-purple-400">
            Commission Level
          </span>
        </div>
      </div>

      {/* 2. QUICK FILTER CHIPS */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 no-print border-b border-slate-200/60 dark:border-slate-800/60 pb-3">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => {
              setActiveFilter(chip.id);
              setSelectedDate(null); // clear date filter on chip toggle
            }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 h-11 sm:h-8.5 text-xs font-semibold rounded-lg border transition-all duration-155 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-800 hover:scale-[1.01] active:scale-[0.99]",
              activeFilter === chip.id
                ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900 shadow-sm"
                : "bg-white border-slate-200 text-slate-655 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-850",
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0",
                activeFilter === chip.id
                  ? "bg-white/20 text-white dark:bg-slate-900/10 dark:text-slate-900"
                  : "bg-slate-105 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {/* 3. CALENDAR + LIST SPLIT VIEW */}
      <div className="grid gap-6 md:grid-cols-[320px_1fr] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-5 shadow-xs">
        
        {/* Left Column: Custom Grid Calendar */}
        <div className="space-y-4 md:pr-4 md:border-r border-slate-150 dark:border-slate-800 select-none">
          
          {/* Calendar Header Controls */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-850 pb-2">
            {/* Mobile Title View: Combined Month + Year */}
            <h3 className="md:hidden text-sm sm:text-base font-extrabold text-slate-850 dark:text-slate-200 pl-1 capitalize">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>

            {/* Desktop selectors view */}
            <div className="hidden md:flex items-center gap-1 min-w-0">
              {/* Month Select */}
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
                <SelectTrigger className="border-none bg-transparent hover:bg-slate-55 dark:hover:bg-slate-800 h-8 px-1.5 text-sm font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-850 dark:text-slate-200 shrink-0">
                  <SelectValue>{currentDate.toLocaleDateString("en-US", { month: "long" })}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {Array.from({ length: 12 }, (_, i) => {
                    const optDate = new Date(2000, i, 1);
                    const label = optDate.toLocaleDateString("en-US", { month: "long" });
                    return (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Year Select */}
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
                <SelectTrigger className="border-none bg-transparent hover:bg-slate-55 dark:hover:bg-slate-800 h-8 px-1 text-sm font-bold flex items-center gap-1 focus:ring-0 focus:ring-offset-0 cursor-pointer text-slate-850 dark:text-slate-200 shrink-0">
                  <SelectValue>{year}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {Array.from({ length: 16 }, (_, i) => {
                    const optYear = new Date().getFullYear() - 5 + i;
                    return (
                      <SelectItem key={optYear} value={String(optYear)}>
                        {optYear}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Navigation buttons: enlarged on mobile for 44px touch targets */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={prevMonth}
                className="h-11 w-11 md:h-8 md:w-8 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg cursor-pointer"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4 text-slate-550 dark:text-slate-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-11 w-11 md:h-8 md:w-8 hover:bg-slate-50 dark:hover:bg-slate-850 rounded-lg cursor-pointer"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4 text-slate-550 dark:text-slate-400" />
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

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-y-1 sm:gap-y-1.5 justify-items-center">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-9 w-9" />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const hasDeadlines = deadlinesByDate.has(dateStr);
              
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
                  className="h-9 w-9 flex items-center justify-center rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 cursor-pointer relative"
                  aria-label={`${dayIsSelected ? 'Selected day ' : ''}${day} ${currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`}
                >
                  <span
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-full transition-all duration-150 relative",
                      dayIsSelected
                        ? "bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-900 font-extrabold shadow-sm scale-105"
                        : hasDeadlines
                        ? "border border-slate-350 text-slate-900 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 font-bold"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850",
                      isToday && !dayIsSelected && "ring-2 ring-primary ring-offset-1 dark:ring-offset-slate-900"
                    )}
                  >
                    {day}
                    {hasDeadlines && !dayIsSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-blue-600 dark:bg-blue-400" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selection indicator message */}
          {selectedDate && (
            <div className="pt-2 text-center">
              <Button
                variant="link"
                size="sm"
                className="text-[11px] font-bold text-blue-600 h-6 px-2 hover:text-blue-700 cursor-pointer"
                onClick={() => setSelectedDate(null)}
              >
                Clear Day Selection
              </Button>
            </div>
          )}
        </div>

        {/* Right Column: Deadlines Timeline */}
        <div className="space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b pb-2 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-550 dark:text-slate-400 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 shrink-0" />
              {selectedDate ? (
                <span>Deadlines for {formatDate(selectedDate.toISOString().slice(0, 10))}</span>
              ) : (
                <span>Deadlines in {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
              )}
            </h4>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border dark:border-slate-750">
              {finalDisplayItems.length} {finalDisplayItems.length === 1 ? "deadline" : "deadlines"}
            </span>
          </div>

          {finalDisplayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/20 dark:bg-slate-900/10">
              <CalendarClock className="h-10 w-10 text-slate-350 dark:text-slate-600 mb-3 animate-pulse" />
              <h5 className="text-sm font-bold text-slate-805 dark:text-slate-200">
                No Deadlines Scheduled
              </h5>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-normal">
                {selectedDate 
                  ? "There are no statutory deadlines scheduled for this specific day."
                  : `There are no deadlines scheduled in ${currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`
                }
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDate(null);
                  router.refresh();
                }}
                className="mt-4 h-9 text-xs font-semibold cursor-pointer border-slate-200 dark:border-slate-800"
              >
                Refresh Calendars
              </Button>
            </div>
          ) : (
            <div className="relative border-l border-slate-200/50 dark:border-slate-800/50 ml-4 pl-6 space-y-5 py-2">
              {displayedGroups.map(([date, group]) => {
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
                return (
                  <div key={date} className="relative space-y-3">
                    {/* Timeline Dot */}
                    <div className="absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-950 dark:bg-slate-800">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>

                    {/* Group Date Header */}
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="text-xs font-bold text-slate-800 dark:text-slate-205">
                        {formatDate(date)}
                      </h3>
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                        {dayName}
                      </span>
                    </div>

                    {/* Group Cards List */}
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
                              "overflow-hidden border border-slate-200 bg-white shadow-xs rounded-xl hover:border-slate-350 dark:border-slate-805 dark:bg-slate-900 dark:hover:border-slate-700 transition-all duration-200 group hover:shadow-2xs",
                              borderCls,
                            )}
                          >
                            <CardContent className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              {/* Document details */}
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div className="mt-0.5 shrink-0 flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-550 dark:text-slate-400">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <Link href={`/rti/${rti.id}`}>
                                    <p className="font-bold text-sm text-slate-850 dark:text-slate-200 group-hover:text-primary transition-colors leading-snug line-clamp-2 cursor-pointer">
                                      {rti.subject}
                                    </p>
                                  </Link>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] font-medium text-slate-455 dark:text-slate-500">
                                    <span className="font-mono">{rti.internal_ref ?? "—"}</span>
                                    {rti.ward && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5">
                                          <MapPin className="h-3 w-3" />
                                          Ward {rti.ward.new_no}
                                        </span>
                                      </>
                                    )}
                                    {rti.public_authority && (
                                      <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 truncate max-w-[140px] sm:max-w-[200px]">
                                          <Building2 className="h-3 w-3" />
                                          {rti.public_authority}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Status & Deadline Badges */}
                              <div className="flex items-center justify-between lg:justify-end gap-2.5 pt-2 lg:pt-0 border-t border-slate-50 lg:border-t-0 dark:border-slate-850 mt-1 lg:mt-0 shrink-0">
                                <div className="flex items-center gap-2">
                                  <RtiStatusBadge status={rti.status} />
                                  <DeadlineBadge rti={rti} rules={rules} />
                                </div>
                                <Link href={`/rti/${rti.id}`}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8.5 w-8.5 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-foreground dark:text-slate-455 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer"
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
