"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VERIFICATION_STATUSES, CONFIDENCE_SCORES } from "@/lib/constants";
import type { WardWithRelations } from "@/lib/types";
import type { ActionState } from "@/lib/actions/contacts";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function WardEditForm({
  action,
  ward,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  ward: WardWithRelations;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success) router.push(`/wards/${ward.new_no}`);
  }, [state, router, ward.new_no]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Ward name *</Label>
          <Input name="newName" defaultValue={ward.new_name} required />
          {fe.newName && <p className="text-xs text-destructive">{fe.newName}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Property count</Label>
          <Input name="propertyCount" defaultValue={ward.property_count ?? ""} />
          {fe.propertyCount && <p className="text-xs text-destructive">{fe.propertyCount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Zone</Label>
          <Input name="zone" defaultValue={ward.zone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Verification status</Label>
          <select name="verificationStatus" defaultValue={ward.verification_status} className={selectCls}>
            {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Confidence</Label>
          <select name="confidenceScore" defaultValue={ward.confidence_score} className={selectCls}>
            {CONFIDENCE_SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea name="notes" defaultValue={ward.notes ?? ""} rows={3} />
      </div>
      <p className="text-xs text-muted-foreground">
        Identity fields (ward number, AC, division, sub-division, derived corporation) come from the
        authoritative source and are not editable here.
      </p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
