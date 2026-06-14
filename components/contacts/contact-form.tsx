"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DESIGNATIONS, VERIFICATION_STATUSES, CONFIDENCE_SCORES } from "@/lib/constants";
import type { ContactWithRelations } from "@/lib/types";
import type { ActionState } from "@/lib/actions/contacts";

type Options = {
  corporations: { id: string; code: string; name: string }[];
  divisions: { id: string; name: string }[];
  subdivisions: { id: string; name: string }[];
};

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ContactForm({
  action,
  options,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: Options;
  initial?: ContactWithRelations;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/contacts/${state.id}`);
  }, [state, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={fe.fullName} required>
          <Input name="fullName" defaultValue={initial?.full_name ?? ""} required />
        </Field>
        <Field label="Designation" error={fe.designation} required>
          <select name="designation" defaultValue={initial?.designation ?? ""} className={selectCls} required>
            <option value="" disabled>Select designation</option>
            {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Phone" error={fe.phone}>
          <Input name="phone" defaultValue={initial?.phone ?? ""} placeholder="9876543210" />
        </Field>
        <Field label="WhatsApp" error={fe.whatsapp}>
          <Input name="whatsapp" defaultValue={initial?.whatsapp ?? ""} placeholder="9876543210" />
        </Field>
        <Field label="Email" error={fe.email}>
          <Input name="email" type="email" defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="Department" error={fe.department}>
          <Input name="department" defaultValue={initial?.department ?? ""} />
        </Field>

        <Field label="Engineering sub-division" error={fe.engSubDivisionId}>
          <select name="engSubDivisionId" defaultValue={initial?.eng_subdivision_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Division" error={fe.divisionId}>
          <select name="divisionId" defaultValue={initial?.division_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Corporation" error={fe.corporationId}>
          <select name="corporationId" defaultValue={initial?.corporation_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.corporations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Office timing" error={fe.officeTiming}>
          <Input name="officeTiming" defaultValue={initial?.office_timing ?? ""} placeholder="10am–5:30pm Mon–Sat" />
        </Field>
      </div>

      <Field label="Office address" error={fe.officeAddress}>
        <Textarea name="officeAddress" defaultValue={initial?.office_address ?? ""} rows={2} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Verification status" error={fe.verificationStatus} required>
          <select name="verificationStatus" defaultValue={initial?.verification_status ?? "PENDING"} className={selectCls} required>
            {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Confidence" error={fe.confidenceScore} required>
          <select name="confidenceScore" defaultValue={initial?.confidence_score ?? "LOW"} className={selectCls} required>
            {CONFIDENCE_SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Source" error={fe.source}>
          <Input name="source" defaultValue={initial?.source ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude" error={fe.latitude}>
          <Input name="latitude" defaultValue={initial?.latitude ?? ""} placeholder="12.9716" />
        </Field>
        <Field label="Longitude" error={fe.longitude}>
          <Input name="longitude" defaultValue={initial?.longitude ?? ""} placeholder="77.5946" />
        </Field>
      </div>

      <Field label="Jurisdiction notes" error={fe.jurisdictionNotes}>
        <Textarea name="jurisdictionNotes" defaultValue={initial?.jurisdiction_notes ?? ""} rows={2} />
      </Field>
      <Field label="Public notes" error={fe.publicNotes}>
        <Textarea name="publicNotes" defaultValue={initial?.public_notes ?? ""} rows={2} />
      </Field>
      <Field label="Internal notes (not shown to viewers)" error={fe.internalNotes}>
        <Textarea name="internalNotes" defaultValue={initial?.internal_notes ?? ""} rows={2} />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create contact"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
