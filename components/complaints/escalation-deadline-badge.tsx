"use client";

import * as React from "react";
import { daysBetween } from "@/lib/rti-deadlines";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  awaiting_ack: "Awaiting acknowledgment",
  awaiting_reply: "Awaiting reply",
  reminder_sent: "Awaiting reply to reminder",
  legal_notice_sent: "Awaiting reply to legal notice",
  escalated: "Escalated",
  replied: "Replied",
  closed: "Closed",
};

/**
 * Countdown for the no-reply escalation ladder — same color-tier convention as
 * components/rti/deadline-badge.tsx (overdue=destructive, <=7d=warning,
 * >15d=success, else=info), just driven by a plain deadline/stage pair instead
 * of RTI's statutory-deadline shape.
 */
export function EscalationDeadlineBadge({
  stage,
  deadline,
}: {
  stage: string;
  deadline: string | null;
}) {
  if (stage === "escalated" || stage === "replied" || stage === "closed" || !deadline) {
    return (
      <span className="text-xs text-muted-foreground italic">{STAGE_LABEL[stage] ?? stage}</span>
    );
  }

  const days = daysBetween(new Date(), deadline);
  const isOverdue = days < 0;
  const absDays = Math.abs(days);

  let variant: "success" | "warning" | "destructive" | "info" = "info";
  if (isOverdue) variant = "destructive";
  else if (days <= 5) variant = "warning";
  else if (days > 10) variant = "success";

  const text = isOverdue ? "days overdue" : absDays === 1 ? "day left to reply" : "days left to reply";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        variant === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/20 dark:bg-emerald-950/30 dark:text-emerald-400",
        variant === "warning" && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/20 dark:bg-amber-950/30 dark:text-amber-400",
        variant === "destructive" && "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/20 dark:bg-rose-950/30 dark:text-rose-400",
        variant === "info" && "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/20 dark:bg-blue-950/30 dark:text-blue-400",
      )}
    >
      {isOverdue && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}
      <span className="font-extrabold">{absDays}</span>
      <span className="opacity-90">{text}</span>
      <span className="opacity-70">· {STAGE_LABEL[stage] ?? stage}</span>
    </div>
  );
}
