"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { WORK_VERIFICATION_STATUSES, type BBMPWorkDetails } from "@/lib/bbmp-works/types";
import { WORK_STATUSES } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/contacts";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** One Input-backed text/number field, laid out like ward-edit-form.tsx's fields. */
function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        step={type === "number" ? "any" : undefined}
      />
    </div>
  );
}

/**
 * Date field. Deliberately does NOT use `<Input type="date" name=.. />`
 * directly: that component's date mode renders a display-only reversed
 * (DD-MM-YYYY) text input carrying the `name`/props, while the real ISO value
 * lives on a sibling hidden input with no `name` at all — so a native
 * FormData submit (which is what useActionState's form action does) reads
 * the reversed display string, not the ISO date. Confirmed by inspecting the
 * rendered DOM. Fixing that is a shared-component change outside this
 * feature's scope, so instead this wrapper keeps the same calendar widget
 * for the picker UI but tracks the ISO value in local state and submits it
 * through its own correctly-named hidden input.
 */
function DateField({
  label,
  name,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  className?: string;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} />
      <input type="hidden" name={name} value={value} readOnly />
    </div>
  );
}

/** One Textarea-backed field. */
function AreaField({
  label,
  name,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      <Textarea name={name} rows={3} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

/** Section wrapper — ward-edit-form.tsx doesn't group its (few) fields into
 *  sections, so this falls back to plain <h3> headers + a 2-col grid, mirroring
 *  the card groupings already used in work-details-card.tsx. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t pt-6 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function WorkEditForm({
  action,
  work,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  work: BBMPWorkDetails;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success) router.push(`/bbmp-works/${work.id}`);
  }, [state, router, work.id]);

  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Section title="Identity">
        <TextField label="Job number" name="jobNumber" defaultValue={work.jobNumber} />
        <TextField label="Work number" name="workNumber" defaultValue={work.workNumber} />
        <TextField label="Project ID" name="projectId" defaultValue={work.projectId} />
        <TextField label="Work category" name="workCategory" defaultValue={work.workCategory} />
        <TextField label="Work type" name="workType" defaultValue={work.workType} />
        <TextField label="Financial year" name="financialYear" defaultValue={work.financialYear} />
        <TextField label="Work name" name="workName" defaultValue={work.workName} className="sm:col-span-2" />
        <AreaField label="Description" name="workDescription" defaultValue={work.workDescription} className="sm:col-span-2" />
      </Section>

      <Section title="Location & administration">
        <TextField label="Ward number" name="wardNumber" defaultValue={work.wardNumber} />
        <TextField label="Ward name" name="wardName" defaultValue={work.wardName} />
        <TextField label="Zone" name="zone" defaultValue={work.zone} />
        <TextField label="Division" name="divisionName" defaultValue={work.divisionName} />
        <TextField label="Sub-division" name="subDivisionName" defaultValue={work.subDivisionName} />
        <TextField label="Department" name="departmentName" defaultValue={work.departmentName} />
        <TextField label="Scheme" name="schemeName" defaultValue={work.schemeName} />
        <TextField label="Grant type" name="grantType" defaultValue={work.grantType} />
        <TextField label="Budget head" name="budgetHead" defaultValue={work.budgetHead} />
      </Section>

      <Section title="Financial">
        <TextField label="Estimate amount" name="estimateAmount" type="number" defaultValue={work.estimateAmount} />
        <TextField label="Sanctioned amount" name="sanctionedAmount" type="number" defaultValue={work.sanctionedAmount} />
        <TextField label="Tender amount" name="tenderAmount" type="number" defaultValue={work.tenderAmount} />
        <TextField label="Paid amount" name="paidAmount" type="number" defaultValue={work.paidAmount} />
      </Section>

      <Section title="Tender & work order">
        <TextField label="Tender number" name="tenderNumber" defaultValue={work.tenderNumber} />
        <DateField label="Tender date" name="tenderDate" defaultValue={work.tenderDate} />
        <TextField label="Tender status" name="tenderStatus" defaultValue={work.tenderStatus} />
        <TextField label="Work order number" name="workOrderNumber" defaultValue={work.workOrderNumber} />
        <DateField label="Work order date" name="workOrderDate" defaultValue={work.workOrderDate} />
      </Section>

      <Section title="Approvals">
        <TextField
          label="Administrative approval number"
          name="administrativeApprovalNumber"
          defaultValue={work.administrativeApprovalNumber}
        />
        <TextField
          label="Technical sanction number"
          name="technicalSanctionNumber"
          defaultValue={work.technicalSanctionNumber}
        />
      </Section>

      <Section title="Dates">
        <DateField label="Start date" name="startDate" defaultValue={work.startDate} />
        <DateField label="Expected completion" name="expectedCompletionDate" defaultValue={work.expectedCompletionDate} />
        <DateField label="Actual completion" name="actualCompletionDate" defaultValue={work.actualCompletionDate} />
      </Section>

      <Section title="Status & progress">
        <div className="space-y-1.5">
          <Label>Work status</Label>
          <select name="workStatus" defaultValue={work.workStatus ?? ""} className={selectCls}>
            <option value="">—</option>
            {WORK_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <TextField label="Physical progress" name="physicalProgress" defaultValue={work.physicalProgress} />
        <TextField
          label="Progress percentage"
          name="progressPercentage"
          type="number"
          defaultValue={work.progressPercentage}
        />
        <div className="space-y-1.5">
          <Label>Verification status</Label>
          <select name="verificationStatus" defaultValue={work.verificationStatus} className={selectCls}>
            {WORK_VERIFICATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {fe.verificationStatus && <p className="text-xs text-destructive">{fe.verificationStatus}</p>}
        </div>
        <AreaField label="Remarks" name="remarks" defaultValue={work.remarks} className="sm:col-span-2" />
      </Section>

      <Section title="Contractor">
        <TextField label="Name" name="contractorName" defaultValue={work.contractorName} />
        <TextField
          label="Registration number"
          name="contractorRegistrationNumber"
          defaultValue={work.contractorRegistrationNumber}
        />
        <TextField label="Phone" name="contractorPhone" defaultValue={work.contractorPhone} />
        <TextField label="Email" name="contractorEmail" defaultValue={work.contractorEmail} />
        <AreaField label="Address" name="contractorAddress" defaultValue={work.contractorAddress} className="sm:col-span-2" />
      </Section>

      <Section title="Engineer chain">
        <TextField label="Engineer" name="engineerName" defaultValue={work.engineerName} />
        <TextField label="Engineer phone" name="engineerPhone" defaultValue={work.engineerPhone} />
        <TextField label="Engineer email" name="engineerEmail" defaultValue={work.engineerEmail} />
        <TextField label="Assistant engineer" name="assistantEngineer" defaultValue={work.assistantEngineer} />
        <TextField
          label="Assistant executive engineer"
          name="assistantExecutiveEngineer"
          defaultValue={work.assistantExecutiveEngineer}
        />
        <TextField label="Executive engineer" name="executiveEngineer" defaultValue={work.executiveEngineer} />
        <TextField label="Superintending engineer" name="superintendingEngineer" defaultValue={work.superintendingEngineer} />
        <TextField label="Chief engineer" name="chiefEngineer" defaultValue={work.chiefEngineer} />
      </Section>

      <Section title="Location">
        <AreaField
          label="Location description"
          name="locationDescription"
          defaultValue={work.locationDescription}
          className="sm:col-span-2"
        />
        <TextField label="Road name" name="roadName" defaultValue={work.roadName} />
        <TextField label="Layout name" name="layoutName" defaultValue={work.layoutName} />
        <TextField label="Latitude" name="latitude" type="number" defaultValue={work.latitude} />
        <TextField label="Longitude" name="longitude" type="number" defaultValue={work.longitude} />
      </Section>

      <div className="flex gap-2 border-t pt-6">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
