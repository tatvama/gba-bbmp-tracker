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
  className,
}: {
  selected: RecipientRoleKey[];
  onToggle: (key: RecipientRoleKey) => void;
  className?: string;
}) {
  const preview = COMPLAINT_RECIPIENT_ROLES.filter((r) => selected.includes(r.key));

  return (
    <div className={`rounded-lg border bg-card p-3 text-sm ${className ?? ""}`}>
      <div className="mb-2 font-medium">Recipient Selection (Copy To)</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {COMPLAINT_RECIPIENT_ROLES.map((r) => (
          <label key={r.key} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.includes(r.key)}
              onChange={() => onToggle(r.key)}
            />
            <span>
              {r.title} <span className="text-muted-foreground">({r.level})</span>
            </span>
          </label>
        ))}
      </div>

      {preview.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
          <div className="mb-0.5 font-medium">Copy To (preview):</div>
          <ol className="list-decimal pl-4">
            {preview.map((r) => (
              <li key={r.key}>
                {r.title} - {r.level}
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
