"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import type { DeadlineRules } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

const FIELDS: { key: keyof DeadlineRules; label: string; hint: string }[] = [
  { key: "normalDays", label: "Normal response (days)", hint: "RTI Act default: 30" },
  { key: "lifeLibertyHours", label: "Life/liberty (hours)", hint: "RTI Act default: 48" },
  { key: "firstAppealDays", label: "First appeal window (days)", hint: "RTI Act default: 30" },
  { key: "secondAppealDays", label: "Second appeal window (days)", hint: "RTI Act default: 90" },
  { key: "faaDisposalDays", label: "FAA disposal target (days)", hint: "RTI Act default: 30" },
  { key: "faaDisposalMaxDays", label: "FAA disposal max (days)", hint: "RTI Act default: 45" },
  { key: "dueSoonDays", label: "“Due soon” threshold (days)", hint: "Badge turns amber within this many days" },
  { key: "criticalOverdueDays", label: "“Critical overdue” after (days)", hint: "Badge escalates past this many days overdue" },
];

export function DeadlineRulesForm({
  action,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: DeadlineRules;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="flex items-center gap-2 rounded-md border border-teal/40 bg-teal/5 p-3 text-sm text-teal">
          <Check className="h-4 w-4" /> Deadline rules saved. Badges and reports now use these values.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Input
              type="number"
              min={1}
              name={f.key}
              defaultValue={initial[f.key]}
              required
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save deadline rules"}
      </Button>
    </form>
  );
}
