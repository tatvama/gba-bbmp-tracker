"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DescriptionRowProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Horizontal label/value row using a 12-column grid.
 * Label occupies 4 columns; value occupies the remaining 8.
 * Callers control typography (font-mono, font-medium, etc.) on children.
 */
export function DescriptionRow({ label, children, className }: DescriptionRowProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-12 gap-x-3 border-b border-border/40 py-2.5 last:border-0",
        className,
      )}
    >
      <dt className="col-span-4 text-sm text-muted-foreground self-start pt-px">
        {label}
      </dt>
      <dd className="col-span-8 min-w-0 break-words whitespace-normal text-sm font-medium text-slate-700 dark:text-slate-300">
        {children}
      </dd>
    </div>
  );
}

/**
 * Optional container that wraps a set of DescriptionRow items in a <dl>.
 * Accepts an optional heading rendered above the rows.
 */
export function DescriptionList({
  heading,
  children,
  className,
}: {
  heading?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-0", className)}>
      {heading && (
        <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          {heading}
        </p>
      )}
      <dl>{children}</dl>
    </div>
  );
}
