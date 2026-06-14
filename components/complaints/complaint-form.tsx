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
  COMPLAINT_TYPES,
  COMPLAINT_STATUSES,
  COMPLAINT_FILED_MODES,
  PUBLIC_IMPACT_LEVELS,
  PRIORITIES,
} from "@/lib/constants";
import type { Complaint } from "@/lib/types";
import type { ActionState } from "@/lib/actions/complaints";

export type ComplaintFormOptions = {
  corporations: { id: string; code: string; name: string }[];
  divisions: { id: string; name: string }[];
  wards: { id: string; new_no: number; new_name: string }[];
  subdivisions: { id: string; name: string }[];
  contacts: { id: string; full_name: string; designation: string }[];
};

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ComplaintForm({
  action,
  options,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: ComplaintFormOptions;
  initial?: Complaint;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/complaints/${state.id}`);
  }, [state, router]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{state.error}</div>
      )}

      <Section title="Complaint">
        <Field label="Title" error={fe.title} required className="sm:col-span-2">
          <Input name="title" defaultValue={initial?.title ?? ""} required />
        </Field>
        <Field label="Type" error={fe.type} required>
          <select name="type" defaultValue={initial?.type ?? "Other"} className={selectCls} required>
            {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Sub-type" error={fe.complaintSubtype}>
          <Input name="complaintSubtype" defaultValue={initial?.complaint_subtype ?? ""} />
        </Field>
        <Field label="Status" error={fe.status}>
          <select name="status" defaultValue={initial?.status ?? "Draft"} className={selectCls}>
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Priority" error={fe.priority}>
          <select name="priority" defaultValue={initial?.priority ?? "Medium"} className={selectCls}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Public impact" error={fe.publicImpact}>
          <select name="publicImpact" defaultValue={initial?.public_impact ?? ""} className={selectCls}>
            <option value="">—</option>
            {PUBLIC_IMPACT_LEVELS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Description" error={fe.description} className="sm:col-span-2">
          <Textarea name="description" defaultValue={initial?.description ?? ""} rows={3} />
        </Field>
        <Field label="Requested action" error={fe.requestedAction} className="sm:col-span-2">
          <Textarea name="requestedAction" defaultValue={initial?.requested_action ?? ""} rows={2} />
        </Field>
      </Section>

      <Section title="Filing">
        <Field label="External complaint no." error={fe.externalComplaintNumber}>
          <Input name="externalComplaintNumber" defaultValue={initial?.complaint_number ?? ""} placeholder="From the portal / acknowledgement" />
        </Field>
        <Field label="RTI no. (if any)" error={fe.rtiNumber}>
          <Input name="rtiNumber" defaultValue={initial?.rti_number ?? ""} />
        </Field>
        <Field label="Filed mode" error={fe.complaintFiledMode}>
          <select name="complaintFiledMode" defaultValue={initial?.complaint_mode ?? ""} className={selectCls}>
            <option value="">—</option>
            {COMPLAINT_FILED_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Filed to" error={fe.complaintFiledTo}>
          <Input name="complaintFiledTo" defaultValue={initial?.complaint_filed_to ?? ""} />
        </Field>
        <Field label="Filed by" error={fe.complaintFiledBy}>
          <Input name="complaintFiledBy" defaultValue={initial?.complaint_filed_by ?? ""} />
        </Field>
        <Field label="Responsible department" error={fe.responsibleDepartment}>
          <Input name="responsibleDepartment" defaultValue={initial?.responsible_department ?? ""} />
        </Field>
        <Field label="Complaint given date" error={fe.complaintGivenDate}>
          <Input type="date" name="complaintGivenDate" defaultValue={initial?.date_submitted ?? ""} />
        </Field>
        <Field label="Acknowledgement date" error={fe.acknowledgementDate}>
          <Input type="date" name="acknowledgementDate" defaultValue={initial?.acknowledgment_date ?? ""} />
        </Field>
        <Field label="Expected resolution date" error={fe.expectedResolutionDate}>
          <Input type="date" name="expectedResolutionDate" defaultValue={initial?.expected_resolution_date ?? ""} />
        </Field>
        <Field label="Next follow-up date" error={fe.nextFollowUpDate}>
          <Input type="date" name="nextFollowUpDate" defaultValue={initial?.next_follow_up_date ?? ""} />
        </Field>
      </Section>

      <Section title="Location & assignment">
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
        <Field label="Sub-division" error={fe.engSubDivisionId}>
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
        <Field label="Assigned engineer" error={fe.assignedEngineerId}>
          <select name="assignedEngineerId" defaultValue={initial?.assigned_engineer_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.designation}</option>)}
          </select>
        </Field>
        <Field label="Assigned officer" error={fe.assignedOfficerId}>
          <select name="assignedOfficerId" defaultValue={initial?.assigned_officer_id ?? ""} className={selectCls}>
            <option value="">—</option>
            {options.contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.designation}</option>)}
          </select>
        </Field>
        <Field label="Location" error={fe.locationText} className="sm:col-span-2">
          <Input name="locationText" defaultValue={initial?.location ?? ""} />
        </Field>
        <Field label="Landmark" error={fe.landmark}>
          <Input name="landmark" defaultValue={initial?.landmark ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Latitude" error={fe.latitude}>
            <Input name="latitude" defaultValue={initial?.latitude ?? ""} placeholder="12.97" />
          </Field>
          <Field label="Longitude" error={fe.longitude}>
            <Input name="longitude" defaultValue={initial?.longitude ?? ""} placeholder="77.59" />
          </Field>
        </div>
      </Section>

      <Section title="Notes & reminders">
        <Field label="Internal notes" error={fe.notes} className="sm:col-span-2">
          <Textarea name="notes" defaultValue={initial?.notes ?? ""} rows={2} />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox id="reminderEnabled" name="reminderEnabled" defaultChecked={initial?.reminder_flag ?? true} />
          <Label htmlFor="reminderEnabled" className="font-normal">Enable follow-up reminders</Label>
        </div>
      </Section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : "Create complaint"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label, error, required, className, children,
}: {
  label: string; error?: string; required?: boolean; className?: string; children: React.ReactNode;
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
