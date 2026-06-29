"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  Hourglass,
  Scale,
  Building,
  CheckCircle2,
  FileText,
  MapPin,
  Building2,
  Calendar,
  ArrowRight,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Filter items
  const filteredItems = React.useMemo(() => {
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

  // Group by due date
  const groups = React.useMemo(() => {
    const map = new Map<string, typeof filteredItems>();
    for (const it of filteredItems) {
      const key = it.active!.due;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

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
    <div className="space-y-6">
      {/* 1. DASHBOARD SUMMARY BAR */}
      <div className="grid gap-3.5 grid-cols-2 md:grid-cols-5 no-print">
        {/* Overdue */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-24 border-t-2 border-t-rose-500">
          <div className="flex items-center justify-between gap-2 text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">Overdue</span>
            <AlertTriangle className="h-4.5 w-4.5" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
            {overdueCount}
          </span>
          <span className="text-[9.5px] font-semibold text-rose-650 dark:text-rose-400 mt-1">
            Action needed
          </span>
        </div>

        {/* Due This Week */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-24 border-t-2 border-t-amber-500">
          <div className="flex items-center justify-between gap-2 text-amber-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">Due This Week</span>
            <Clock className="h-4.5 w-4.5" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
            {dueThisWeekCount}
          </span>
          <span className="text-[9.5px] font-semibold text-amber-600 dark:text-amber-450 mt-1">
            Requires attention
          </span>
        </div>

        {/* Upcoming */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-24 border-t-2 border-t-emerald-500">
          <div className="flex items-center justify-between gap-2 text-emerald-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">Upcoming</span>
            <Calendar className="h-4.5 w-4.5" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
            {upcomingCount}
          </span>
          <span className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-450 mt-1">
            Within timeline
          </span>
        </div>

        {/* First Appeals */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-24 border-t-2 border-t-purple-500">
          <div className="flex items-center justify-between gap-2 text-purple-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">1st Appeals</span>
            <Scale className="h-4.5 w-4.5" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
            {firstAppealsCount}
          </span>
          <span className="text-[9.5px] font-semibold text-purple-600 dark:text-purple-400 mt-1">
            FAA Level
          </span>
        </div>

        {/* Second Appeals */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs flex flex-col justify-between h-24 border-t-2 border-t-purple-500">
          <div className="flex items-center justify-between gap-2 text-purple-600">
            <span className="text-[10px] font-bold uppercase tracking-wider">2nd Appeals</span>
            <Building className="h-4.5 w-4.5" />
          </div>
          <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
            {secondAppealsCount}
          </span>
          <span className="text-[9.5px] font-semibold text-purple-600 dark:text-purple-400 mt-1">
            Commission Level
          </span>
        </div>
      </div>

      {/* 2. QUICK FILTER CHIPS */}
      <div className="flex flex-wrap gap-2 no-print border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setActiveFilter(chip.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-800",
              activeFilter === chip.id
                ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-850",
            )}
          >
            {chip.label}
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md font-bold",
                activeFilter === chip.id
                  ? "bg-white/20 text-white dark:bg-slate-900/10 dark:text-slate-900"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
              )}
            >
              {chip.count}
            </span>
          </button>
        ))}
      </div>

      {/* 3. TIMELINE LAYOUT */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-xs">
          <CalendarClock className="h-10 w-10 text-slate-400 mb-2" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            ✓ No RTIs found
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            No deadlines match the selected filter criteria.
          </p>
        </div>
      ) : (
        <div className="relative border-l border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-8 py-2">
          {groups.map(([date, group]) => {
            const dateObj = new Date(date);
            const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
            return (
              <div key={date} className="relative space-y-3.5">
                {/* Timeline Dot */}
                <div className="absolute -left-[31px] top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white bg-slate-200 dark:border-slate-950 dark:bg-slate-800">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>

                {/* Date Header */}
                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-450 dark:text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100">
                      {formatDate(date)}
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                    {dayName}
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border dark:border-slate-750">
                    {group.length} {group.length === 1 ? "deadline" : "deadlines"}
                  </span>
                </div>

                {/* Group Cards */}
                <div className="space-y-3.5 pl-0.5">
                  {group.map(({ rti, active, days }) => {
                    // Determine left border accent color
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
                          "overflow-hidden border border-slate-200 bg-white shadow-xs rounded-xl hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900 dark:hover:border-slate-700 transition-all duration-200 group",
                          borderCls,
                        )}
                      >
                        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          {/* Left: Document details */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              <FileText className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0">
                              <Link href={`/rti/${rti.id}`}>
                                <p className="font-bold text-sm text-slate-850 dark:text-slate-200 group-hover:text-primary transition-colors leading-normal line-clamp-2">
                                  {rti.subject}
                                </p>
                              </Link>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] font-medium text-slate-450 dark:text-slate-550">
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
                                    <span className="flex items-center gap-0.5 truncate max-w-[180px]">
                                      <Building2 className="h-3 w-3" />
                                      {rti.public_authority}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Center/Right: Status and Deadline Badge */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <RtiStatusBadge status={rti.status} />
                            <DeadlineBadge rti={rti} rules={rules} />
                            <Link href={`/rti/${rti.id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-foreground dark:text-slate-450 dark:hover:text-slate-200"
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
  );
}
