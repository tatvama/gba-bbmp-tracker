"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { activeDeadline, daysBetween } from "@/lib/rti-deadlines";
import { cn } from "@/lib/utils";
import type { RtiDeadlineFields } from "@/lib/rti-deadlines";
import type { DeadlineRules } from "@/lib/constants";
import { DEFAULT_DEADLINE_RULES } from "@/lib/constants";

export function DeadlineBadge({
  rti,
  rules = DEFAULT_DEADLINE_RULES,
  withLabel,
}: {
  rti: RtiDeadlineFields;
  rules?: DeadlineRules;
  withLabel?: boolean;
}) {
  if (rti.status === "Closed") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-55/40 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Closed
      </div>
    );
  }

  const active = activeDeadline(rti, new Date(), rules);
  if (!active) {
    return <span className="text-xs text-muted-foreground italic">Pending</span>;
  }

  const days = daysBetween(new Date(), active.due);
  const isOverdue = days < 0;
  const absDays = Math.abs(days);

  // Styling based on deadline stage / status
  let variant: "success" | "warning" | "destructive" | "info" = "info";
  if (active.bucket === "overdue" || active.bucket === "critical-overdue" || isOverdue) {
    variant = "destructive";
  } else if (days <= 7) {
    variant = "warning";
  } else if (days > 15) {
    variant = "success";
  }

  const number = absDays;
  const text = isOverdue ? "Days Overdue" : days === 1 ? "Day Left" : "Days Left";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg border p-1.5 px-3 shadow-xs transition-all duration-200",
        variant === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/20 dark:bg-emerald-950/30 dark:text-emerald-400",
        variant === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/30 dark:text-amber-400",
        variant === "destructive" &&
          "border-rose-200 bg-rose-55 text-rose-800 dark:border-rose-900/20 dark:bg-rose-950/30 dark:text-rose-400",
        variant === "info" &&
          "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/20 dark:bg-blue-950/30 dark:text-blue-450",
      )}
    >
      {/* Indicator Dot */}
      {isOverdue && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}

      {/* Countdown details */}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1">
          <span className="text-base font-extrabold tracking-tight dark:text-white">{number}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">{text}</span>
        </div>
        <span className="text-[8px] font-bold opacity-80 mt-0.5 tracking-wider uppercase">
          {active.label}
        </span>
      </div>
    </div>
  );
}
