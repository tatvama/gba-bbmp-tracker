"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { RTI_CATEGORIES, PRIORITIES } from "@/lib/constants";
import { createRti } from "@/lib/actions/rti";
import type { ActionState } from "@/lib/actions/contacts";

const selectCls =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Minimal RTI create form. You file the RTI manually elsewhere; this just opens
 * a tracking record, then you upload the request + acknowledgement on the detail
 * page. On success it redirects to the new RTI so documents can be added.
 */
export function RtiQuickCreateForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createRti,
    {} as ActionState,
  );

  React.useEffect(() => {
    if (state?.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-5">
          {state?.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject / title *</Label>
            <Input
              id="subject"
              name="subject"
              required
              minLength={3}
              placeholder="e.g. Road work bills for Ward 112"
              className="h-11"
            />
            {state?.fieldErrors?.subject && (
              <p className="text-xs text-destructive">{state.fieldErrors.subject}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publicAuthority">Public authority (optional)</Label>
            <Input
              id="publicAuthority"
              name="publicAuthority"
              placeholder="e.g. BBMP West Zone — PIO, Engineering"
              className="h-11"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category (optional)</Label>
              <select id="category" name="category" className={selectCls} defaultValue="">
                <option value="">— Select —</option>
                {RTI_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select id="priority" name="priority" className={selectCls} defaultValue="Medium">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <input type="hidden" name="status" value="Draft" />
          <input type="hidden" name="wardType" value="BBMP" />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create &amp; add documents
            </Button>
            <p className="text-xs text-muted-foreground">
              You&apos;ll upload the RTI copy and acknowledgement next.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
