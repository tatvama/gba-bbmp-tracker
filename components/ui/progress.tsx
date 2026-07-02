import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal progress bar (no Radix dep): value 0..100. `indeterminate` renders
 * a sliding shimmer for "working, no percentage" stages.
 */
export function Progress({
  value,
  indeterminate = false,
  className,
  barClassName,
}: {
  value?: number;
  indeterminate?: boolean;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-slate-150 dark:bg-slate-800", className)}
    >
      {indeterminate ? (
        <div className={cn("absolute inset-y-0 w-1/3 animate-progress-slide rounded-full bg-primary/70", barClassName)} />
      ) : (
        <div
          className={cn("h-full rounded-full bg-primary transition-[width] duration-500 ease-out", barClassName)}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
