"use client";

import * as React from "react";
import { COMPLAINT_RECIPIENT_ROLES, type RecipientRoleKey } from "@/lib/complaints/recipient-roles";

/**
 * Recipient Selection — the reusable 5-role Copy-To checklist shown before a
 * complaint letter is filed. Registry-driven (adding a role needs no change
 * here), with a live Copy-To preview. The mandatory Office Copy is always
 * generated automatically, so it is stated, not toggled.
 */
export function RecipientSelector({
  selected,
  onToggle,
  onSelectAll,
  officeOverrides,
  className,
}: {
  selected: RecipientRoleKey[];
  onToggle: (key: RecipientRoleKey) => void;
  onSelectAll?: (keys: RecipientRoleKey[]) => void;
  /** Per-role office text to show alongside the level, e.g. the complaint's own
   *  zone/corporation for the Commissioner ("Bengaluru South City Corporation")
   *  — mirrors what the server resolver will actually render into the Copy To. */
  officeOverrides?: Partial<Record<RecipientRoleKey, string>>;
  className?: string;
}) {
  const preview = COMPLAINT_RECIPIENT_ROLES.filter((r) => selected.includes(r.key));
  const allKeys = COMPLAINT_RECIPIENT_ROLES.map((r) => r.key);
  const isAllSelected = allKeys.every((k) => selected.includes(k));

  return (
    <div className={`rounded-lg border bg-card p-3 text-sm ${className ?? ""}`}>
      <div className="mb-2 flex items-center justify-between border-b pb-1.5 border-slate-100 dark:border-slate-800">
        <span className="font-medium text-slate-800 dark:text-slate-200">Recipient Selection (Copy To)</span>
        {onSelectAll && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors font-medium">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 cursor-pointer rounded accent-primary"
              checked={isAllSelected}
              onChange={() => {
                if (isAllSelected) {
                  onSelectAll([]);
                } else {
                  onSelectAll(allKeys);
                }
              }}
            />
            <span>Select All</span>
          </label>
        )}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2 mt-2">
        {COMPLAINT_RECIPIENT_ROLES.map((r) => (
          <label key={r.key} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={selected.includes(r.key)}
              onChange={() => onToggle(r.key)}
            />
            <span className="text-slate-700 dark:text-slate-300">
              {r.title}{" "}
              <span className="text-muted-foreground text-xs">
                ({officeOverrides?.[r.key] ?? r.level})
              </span>
            </span>
          </label>
        ))}
      </div>

      {preview.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
          <div className="mb-0.5 font-medium">Copy To (preview):</div>
          <ol className="list-decimal pl-4 text-slate-600 dark:text-slate-400">
            {preview.map((r) => (
              <li key={r.key}>
                {r.title} - {officeOverrides?.[r.key] ?? r.level}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        An Office Copy (full internal distribution) is generated automatically and stored with this document.
      </p>
    </div>
  );
}
