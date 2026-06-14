"use client";

import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  activeDeadline,
  daysBetween,
  type RtiDeadlineFields,
} from "@/lib/rti-deadlines";
import type { DeadlineBucket, DeadlineRules } from "@/lib/constants";
import { DEFAULT_DEADLINE_RULES } from "@/lib/constants";

const BUCKET_VARIANT: Record<DeadlineBucket, BadgeProps["variant"]> = {
  "due-10plus": "success",
  "due-soon": "warning",
  "due-today": "warning",
  overdue: "destructive",
  "critical-overdue": "destructive",
};

function countdown(due: string, bucket: DeadlineBucket): string {
  const diff = daysBetween(new Date(), due);
  if (bucket === "due-today") return "due today";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `in ${diff}d`;
}

/** Countdown chip for the deadline that currently matters for an RTI. */
export function DeadlineBadge({
  rti,
  rules = DEFAULT_DEADLINE_RULES,
  withLabel = true,
}: {
  rti: RtiDeadlineFields;
  rules?: DeadlineRules;
  withLabel?: boolean;
}) {
  const active = activeDeadline(rti, new Date(), rules);
  if (!active) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge
      variant={BUCKET_VARIANT[active.bucket]}
      className={cn(
        "gap-1 font-medium",
        active.bucket === "critical-overdue" && "ring-2 ring-destructive/40",
      )}
      title={`${active.label} due ${active.due}`}
    >
      {withLabel && <span className="opacity-90">{active.label}:</span>}
      {countdown(active.due, active.bucket)}
    </Badge>
  );
}
