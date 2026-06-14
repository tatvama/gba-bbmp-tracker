"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  RTI_CATEGORIES,
  RTI_FILING_MODES,
  RTI_STATUSES,
  RTI_SATISFACTION,
  PRIORITIES,
} from "@/lib/constants";
import type { RtiWithRelations } from "@/lib/types";
import type { ActionState } from "@/lib/actions/contacts";

export type RtiFormOptions = {
  corporations: { id: string; code: string; name: string }[];
  divisions: { id: string; name: string }[];
  subdivisions: { id: string; name: string }[];
  wards: { id: string; new_no: number; new_name: string }[];
  contacts: { id: string; full_name: string; designation: string }[];
};

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RtiForm({
  action,
  options,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: RtiFormOptions;
  initial?: RtiWithRelations;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Section title="Request">
        <Field label="Subject" error={fe.subject} required className="sm:col-span-2">
          <Input name="subject" defaultValue={initial?.subject ?? ""} required />
        </Field>
        <Field label="Category" error={fe.category}>
          <select name="category" defaultValue={initial?.category ?? ""} className={selectCls}>
            <option value="">—</option>
            {RTI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority" error={fe.priority}>
          <select name="priority" defaultValue={initial?.priority ?? "Medium"} className={selectCls}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status" error={fe.status}>
          <select name="status" defaultValue={initial?.status ?? "Draft"} className={selectCls}>
            {RTI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Filing mode" error={fe.filingMode}>
          <select name="filingMode" defaultValue={initial?.filing_mode ?? ""} className={selectCls}>
            <option value="">—</option>
            {RTI_FILING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Information requested" error={fe.infoRequested} className="sm:col-span-2">
          <Textarea name="infoRequested" defaultValue={initial?.info_requested ?? ""} rows={4} placeholder="One information request per line." />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="isLifeLiberty" name="isLifeLiberty" defaultChecked={initial?.is_life_liberty ?? false} />
          <Label htmlFor="isLifeLiberty" className="font-normal">
            Life / liberty case (48-hour reply deadline)
          </Label>
        </div>
      </Section>

      <Section title="Jurisdiction">
        <Field label="Corporation" error={fe.corporationId}>
          <select name="corporationId" defaultValue={initial?.corporation_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.corporations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Division" error={fe.divisionId}>
          <select name="divisionId" defaultValue={initial?.division_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Engineering sub-division" error={fe.engSubDivisionId}>
          <select name="engSubDivisionId" defaultValue={initial?.eng_subdivision_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Ward" error={fe.wardId}>
          <select name="wardId" defaultValue={initial?.ward_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.wards.map((w) => <option key={w.id} value={w.id}>{w.new_no} · {w.new_name}</option>)}
          </select>
        </Field>
        <Field label="Officer on record" error={fe.contactId} className="sm:col-span-2">
          <select name="contactId" defaultValue={initial?.contact_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.designation}</option>)}
          </select>
        </Field>
      </Section>

      <Section title="Public authority / PIO / FAA">
        <Field label="Public authority" error={fe.publicAuthority}>
          <Input name="publicAuthority" defaultValue={initial?.public_authority ?? ""} />
        </Field>
        <Field label="Department" error={fe.department}>
          <Input name="department" defaultValue={initial?.department ?? ""} />
        </Field>
        <Field label="Office address" error={fe.officeAddress} className="sm:col-span-2">
          <Textarea name="officeAddress" defaultValue={initial?.office_address ?? ""} rows={2} />
        </Field>
        <Field label="PIO name" error={fe.pioName}>
          <Input name="pioName" defaultValue={initial?.pio_name ?? ""} />
        </Field>
        <Field label="PIO designation" error={fe.pioDesignation}>
          <Input name="pioDesignation" defaultValue={initial?.pio_designation ?? ""} />
        </Field>
        <Field label="PIO phone" error={fe.pioPhone}>
          <Input name="pioPhone" defaultValue={initial?.pio_phone ?? ""} />
        </Field>
        <Field label="PIO email" error={fe.pioEmail}>
          <Input name="pioEmail" type="email" defaultValue={initial?.pio_email ?? ""} />
        </Field>
        <Field label="FAA name" error={fe.faaName}>
          <Input name="faaName" defaultValue={initial?.faa_name ?? ""} />
        </Field>
        <Field label="FAA designation" error={fe.faaDesignation}>
          <Input name="faaDesignation" defaultValue={initial?.faa_designation ?? ""} />
        </Field>
        <Field label="FAA phone" error={fe.faaPhone}>
          <Input name="faaPhone" defaultValue={initial?.faa_phone ?? ""} />
        </Field>
        <Field label="FAA email" error={fe.faaEmail}>
          <Input name="faaEmail" type="email" defaultValue={initial?.faa_email ?? ""} />
        </Field>
      </Section>

      <Section title="Applicant">
        <Field label="Applicant name" error={fe.applicantName}>
          <Input name="applicantName" defaultValue={initial?.applicant_name ?? ""} />
        </Field>
        <Field label="Applicant phone" error={fe.applicantPhone}>
          <Input name="applicantPhone" defaultValue={initial?.applicant_phone ?? ""} />
        </Field>
        <Field label="Applicant email" error={fe.applicantEmail}>
          <Input name="applicantEmail" type="email" defaultValue={initial?.applicant_email ?? ""} />
        </Field>
        <Field label="Applicant address" error={fe.applicantAddress}>
          <Input name="applicantAddress" defaultValue={initial?.applicant_address ?? ""} />
        </Field>
      </Section>

      <Section title="Filing details & dates">
        <Field label="Date drafted" error={fe.dateDrafted}>
          <Input type="date" name="dateDrafted" defaultValue={initial?.date_drafted ?? ""} />
        </Field>
        <Field label="Date filed" error={fe.dateFiled}>
          <Input type="date" name="dateFiled" defaultValue={initial?.date_filed ?? ""} />
        </Field>
        <Field label="Date received by authority" error={fe.dateReceived}>
          <Input type="date" name="dateReceived" defaultValue={initial?.date_received ?? ""} />
        </Field>
        <Field label="Reply date" error={fe.replyDate}>
          <Input type="date" name="replyDate" defaultValue={initial?.reply_date ?? ""} />
        </Field>
        <Field label="Postal receipt no." error={fe.postalReceiptNo}>
          <Input name="postalReceiptNo" defaultValue={initial?.postal_receipt_no ?? ""} />
        </Field>
        <Field label="Online registration no." error={fe.onlineRegNo}>
          <Input name="onlineRegNo" defaultValue={initial?.online_reg_no ?? ""} />
        </Field>
        <Field label="Fee mode" error={fe.feeMode}>
          <Input name="feeMode" defaultValue={initial?.fee_mode ?? ""} placeholder="IPO / DD / Online / Court fee stamp" />
        </Field>
        <Field label="Satisfaction" error={fe.satisfactionStatus}>
          <select name="satisfactionStatus" defaultValue={initial?.satisfaction_status ?? ""} className={selectCls}>
            <option value="">—</option>
            {RTI_SATISFACTION.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox id="applicationFeePaid" name="applicationFeePaid" defaultChecked={initial?.application_fee_paid ?? false} />
          <Label htmlFor="applicationFeePaid" className="font-normal">Application fee paid</Label>
        </div>
      </Section>

      <Section title="Reply, workflow & notes">
        <Field label="Reply summary" error={fe.replySummary} className="sm:col-span-2">
          <Textarea name="replySummary" defaultValue={initial?.reply_summary ?? ""} rows={2} />
        </Field>
        <Field label="Next action" error={fe.nextAction}>
          <Input name="nextAction" defaultValue={initial?.next_action ?? ""} />
        </Field>
        <Field label="Next action date" error={fe.nextActionDate}>
          <Input type="date" name="nextActionDate" defaultValue={initial?.next_action_date ?? ""} />
        </Field>
        <Field label="Tags (comma-separated)" error={fe.tags} className="sm:col-span-2">
          <Input name="tags" defaultValue={initial?.tags?.join(", ") ?? ""} />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="reminderEnabled" name="reminderEnabled" defaultChecked={initial?.reminder_enabled ?? false} />
          <Label htmlFor="reminderEnabled" className="font-normal">Enable deadline reminders</Label>
        </div>
        <Field label="Public notes" error={fe.publicNotes} className="sm:col-span-2">
          <Textarea name="publicNotes" defaultValue={initial?.public_notes ?? ""} rows={2} />
        </Field>
        <Field label="Internal notes (not shown to viewers)" error={fe.internalNotes} className="sm:col-span-2">
          <Textarea name="internalNotes" defaultValue={initial?.internal_notes ?? ""} rows={2} />
        </Field>
      </Section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create RTI"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className={cn(error && "text-destructive")}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
