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
import type { Complaint, ComplaintWithRelations } from "@/lib/types";
import type { ActionState } from "@/lib/actions/complaints";
import {
  getCorporationsAction,
  getDivisionsAction,
  getSubdivisionsAction,
  getWardsAction,
  getContactsAction,
} from "@/lib/actions/complaints";

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

  const comp = initial as any;

  // Selected values
  const [wardType, setWardType] = React.useState<string>(comp?.ward_type ?? "");
  const [corpId, setCorpId] = React.useState<string>(comp?.corporation_id ?? "");
  const [divId, setDivId] = React.useState<string>(comp?.ward_type === "GBA" ? (comp?.gba_division ?? "") : (comp?.division_id ?? ""));
  const [subDivId, setSubDivId] = React.useState<string>(comp?.ward_type === "GBA" ? (comp?.gba_subdivision ?? "") : (comp?.eng_subdivision_id ?? ""));
  const [wardId, setWardId] = React.useState<string>(comp?.ward_type === "GBA" ? (comp?.gba_ward_id ?? "") : (comp?.ward_id ?? ""));
  const [engId, setEngId] = React.useState<string>(comp?.assigned_engineer_id ?? "");
  const [offId, setOffId] = React.useState<string>(comp?.assigned_officer_id ?? "");

  // Options lists
  const [corporations, setCorporations] = React.useState<{ id: string; code: string; name: string }[]>(() => {
    if (comp?.corporation_id && comp?.corporation) {
      return [{ id: comp.corporation_id, code: comp.corporation.code, name: comp.corporation.name }];
    }
    return [];
  });
  const [divisions, setDivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (comp?.ward_type === "GBA" && comp?.gba_division) {
      return [{ id: comp.gba_division, name: comp.gba_division }];
    }
    if (comp?.division_id && comp?.division) {
      return [{ id: comp.division_id, name: comp.division.name }];
    }
    return [];
  });
  const [subdivisions, setSubdivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (comp?.ward_type === "GBA" && comp?.gba_subdivision) {
      return [{ id: comp.gba_subdivision, name: comp.gba_subdivision }];
    }
    if (comp?.eng_subdivision_id && comp?.eng_subdivision) {
      return [{ id: comp.eng_subdivision_id, name: comp.eng_subdivision.name }];
    }
    return [];
  });
  const [wards, setWards] = React.useState<{ id: string; new_no: number; new_name: string }[]>(() => {
    if (comp?.ward_type === "GBA" && comp?.gba_ward_id && comp?.gba_ward) {
      return [{ id: comp.gba_ward_id, new_no: comp.gba_ward.ward_no, new_name: comp.gba_ward.ward_name_en }];
    }
    if (comp?.ward_id && comp?.ward) {
      return [{ id: comp.ward_id, new_no: comp.ward.new_no, new_name: comp.ward.new_name }];
    }
    return [];
  });
  const [engineers, setEngineers] = React.useState<{ id: string; full_name: string; designation: string }[]>(() => {
    if (comp?.assigned_engineer_id && comp?.assigned_engineer) {
      return [{
        id: comp.assigned_engineer_id,
        full_name: comp.assigned_engineer.full_name,
        designation: comp.assigned_engineer.designation ?? ""
      }];
    }
    return [];
  });
  const [officers, setOfficers] = React.useState<{ id: string; full_name: string; designation: string }[]>(() => {
    if (comp?.assigned_officer_id && comp?.assigned_officer) {
      return [{
        id: comp.assigned_officer_id,
        full_name: comp.assigned_officer.full_name,
        designation: comp.assigned_officer.designation ?? ""
      }];
    }
    return [];
  });

  // Loading states
  const [loadingCorps, setLoadingCorps] = React.useState(false);
  const [loadingDivs, setLoadingDivs] = React.useState(false);
  const [loadingSubs, setLoadingSubs] = React.useState(false);
  const [loadingWards, setLoadingWards] = React.useState(false);
  const [loadingContacts, setLoadingContacts] = React.useState(false);

  // Load hierarchy lists when page loads with initial value
  React.useEffect(() => {
    async function loadInitialData() {
      if (!comp) return;

      const fetches: Promise<any>[] = [];
      const currentWardType = comp.ward_type || "BBMP";

      if (comp.ward_type) {
        fetches.push(
          getCorporationsAction()
            .then(setCorporations)
            .catch((e) => console.error("Error loading initial corporations:", e))
        );
      }

      if (comp.corporation_id) {
        fetches.push(
          getDivisionsAction(comp.corporation_id, currentWardType)
            .then(setDivisions)
            .catch((e) => console.error("Error loading initial divisions:", e))
        );
      }

      const activeDivId = currentWardType === "GBA" ? comp.gba_division : comp.division_id;
      if (activeDivId && comp.corporation_id) {
        fetches.push(
          getSubdivisionsAction(activeDivId, comp.corporation_id, currentWardType)
            .then(setSubdivisions)
            .catch((e) => console.error("Error loading initial subdivisions:", e))
        );
      }

      const activeSubId = currentWardType === "GBA" ? comp.gba_subdivision : comp.eng_subdivision_id;
      if (activeSubId && activeDivId && comp.corporation_id) {
        fetches.push(
          getWardsAction(activeSubId, activeDivId, comp.corporation_id, currentWardType)
            .then(setWards)
            .catch((e) => console.error("Error loading initial wards:", e))
        );
        fetches.push(
          getContactsAction(activeSubId, currentWardType)
            .then((contactsList) => {
              const engineerDesignations = [
                "Chief Engineer",
                "Superintending Engineer",
                "Executive Engineer",
                "Assistant Executive Engineer",
                "Assistant Engineer",
                "Junior Engineer",
                "Ward Engineer",
              ];
              const officerDesignations = [
                "Health Officer",
                "Revenue Officer",
                "Office Staff",
              ];
              setEngineers(contactsList.filter((c) => engineerDesignations.includes(c.designation)));
              setOfficers(contactsList.filter((c) => officerDesignations.includes(c.designation)));
            })
            .catch((e) => console.error("Error loading initial contacts:", e))
        );
      }

      if (fetches.length > 0) {
        await Promise.all(fetches);
      }
    }

    loadInitialData();
  }, [comp]);

  const handleWardTypeChange = async (val: string) => {
    setWardType(val);
    setCorpId("");
    setDivId("");
    setSubDivId("");
    setWardId("");
    setEngId("");
    setOffId("");
    setCorporations([]);
    setDivisions([]);
    setSubdivisions([]);
    setWards([]);
    setEngineers([]);
    setOfficers([]);

    if (val) {
      setLoadingCorps(true);
      try {
        const corps = await getCorporationsAction();
        setCorporations(corps);
      } catch (error) {
        console.error("Failed to load corporations:", error);
      } finally {
        setLoadingCorps(false);
      }
    }
  };

  const handleCorpChange = async (val: string) => {
    setCorpId(val);
    setDivId("");
    setSubDivId("");
    setWardId("");
    setEngId("");
    setOffId("");
    setDivisions([]);
    setSubdivisions([]);
    setWards([]);
    setEngineers([]);
    setOfficers([]);

    if (val) {
      setLoadingDivs(true);
      try {
        const divs = await getDivisionsAction(val, wardType);
        setDivisions(divs);
      } catch (error) {
        console.error("Failed to load divisions:", error);
      } finally {
        setLoadingDivs(false);
      }
    }
  };

  const handleDivChange = async (val: string) => {
    setDivId(val);
    setSubDivId("");
    setWardId("");
    setEngId("");
    setOffId("");
    setSubdivisions([]);
    setWards([]);
    setEngineers([]);
    setOfficers([]);

    if (val && corpId) {
      setLoadingSubs(true);
      try {
        const subs = await getSubdivisionsAction(val, corpId, wardType);
        setSubdivisions(subs);
      } catch (error) {
        console.error("Failed to load subdivisions:", error);
      } finally {
        setLoadingSubs(false);
      }
    }
  };

  const handleSubDivChange = async (val: string) => {
    setSubDivId(val);
    setWardId("");
    setEngId("");
    setOffId("");
    setWards([]);
    setEngineers([]);
    setOfficers([]);

    if (val && divId && corpId) {
      setLoadingWards(true);
      try {
        const wrdsList = await getWardsAction(val, divId, corpId, wardType);
        setWards(wrdsList);
      } catch (error) {
        console.error("Failed to load wards:", error);
      } finally {
        setLoadingWards(false);
      }
    }
  };

  const handleWardChange = async (val: string) => {
    setWardId(val);
    setEngId("");
    setOffId("");
    setEngineers([]);
    setOfficers([]);

    if (val) {
      setLoadingContacts(true);
      try {
        if (subDivId) {
          const contactsList = await getContactsAction(subDivId, wardType);
          const engineerDesignations = [
            "Chief Engineer",
            "Superintending Engineer",
            "Executive Engineer",
            "Assistant Executive Engineer",
            "Assistant Engineer",
            "Junior Engineer",
            "Ward Engineer",
          ];
          const officerDesignations = [
            "Health Officer",
            "Revenue Officer",
            "Office Staff",
          ];
          setEngineers(contactsList.filter((c) => engineerDesignations.includes(c.designation)));
          setOfficers(contactsList.filter((c) => officerDesignations.includes(c.designation)));
        }
      } catch (error) {
        console.error("Failed to load contacts for ward:", error);
      } finally {
        setLoadingContacts(false);
      }
    }
  };

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
        <Field label="Job / work-order no." error={fe.jobNumber}>
          <Input name="jobNumber" defaultValue={initial?.job_number ?? ""} placeholder="Govt contract job code, e.g. RR-2026-0456" />
        </Field>
        <Field label="Contractor" error={fe.contractor}>
          <Input name="contractor" defaultValue={initial?.contractor ?? ""} placeholder="Contractor / agency name" />
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
        {/* Selected Path Breadcrumb */}
        {wardType && (
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground bg-muted/30 border border-muted/50 p-2.5 rounded-md sm:col-span-2">
            <span className="font-medium text-foreground">Hierarchy:</span>
            <span>{wardType === "GBA" ? "GBA Wards" : "BBMP Wards"}</span>
            {corpId && (
              <>
                <span className="text-muted-foreground/60">&gt;</span>
                <span>{corporations.find((c) => c.id === corpId)?.name || (loadingCorps ? "Loading..." : corpId)}</span>
              </>
            )}
            {divId && (
              <>
                <span className="text-muted-foreground/60">&gt;</span>
                <span>{divisions.find((d) => d.id === divId)?.name || (loadingDivs ? "Loading..." : divId)}</span>
              </>
            )}
            {subDivId && (
              <>
                <span className="text-muted-foreground/60">&gt;</span>
                <span>{subdivisions.find((s) => s.id === subDivId)?.name || (loadingSubs ? "Loading..." : subDivId)}</span>
              </>
            )}
            {wardId && (
              <>
                <span className="text-muted-foreground/60">&gt;</span>
                <span>
                  {(() => {
                    const w = wards.find((w) => w.id === wardId);
                    return w ? `${w.new_no} · ${w.new_name}` : (loadingWards ? "Loading..." : "Selected Ward");
                  })()}
                </span>
              </>
            )}
          </div>
        )}

        <Field label="Ward Type" error={fe.wardType} required>
          <select
            name="wardType"
            value={wardType}
            onChange={(e) => handleWardTypeChange(e.target.value)}
            className={selectCls}
            required
          >
            <option value="">—</option>
            <option value="BBMP">BBMP Wards</option>
            <option value="GBA">GBA Wards</option>
          </select>
        </Field>

        <Field label="Corporation" error={fe.corporationId}>
          <select
            name="corporationId"
            value={corpId}
            onChange={(e) => handleCorpChange(e.target.value)}
            disabled={!wardType || loadingCorps}
            className={selectCls}
          >
            {loadingCorps ? (
              <option value="">Loading Corporations...</option>
            ) : !wardType ? (
              <option value="">Select Ward Type First</option>
            ) : corporations.length === 0 ? (
              <option value="">No Corporations Found</option>
            ) : (
              <>
                <option value="">—</option>
                {corporations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Division" error={fe.divisionId}>
          <select
            name="divisionId"
            value={divId}
            onChange={(e) => handleDivChange(e.target.value)}
            disabled={!corpId || loadingDivs}
            className={selectCls}
          >
            {loadingDivs ? (
              <option value="">Loading Divisions...</option>
            ) : !corpId ? (
              <option value="">Select Corporation First</option>
            ) : divisions.length === 0 ? (
              <option value="">No Divisions Found</option>
            ) : (
              <>
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Sub-division" error={fe.engSubDivisionId}>
          <select
            name="engSubDivisionId"
            value={subDivId}
            onChange={(e) => handleSubDivChange(e.target.value)}
            disabled={!divId || loadingSubs}
            className={selectCls}
          >
            {loadingSubs ? (
              <option value="">Loading Sub-Divisions...</option>
            ) : !divId ? (
              <option value="">Select Division First</option>
            ) : subdivisions.length === 0 ? (
              <option value="">No Sub-Divisions Found</option>
            ) : (
              <>
                <option value="">—</option>
                {subdivisions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Ward" error={fe.wardId}>
          <select
            name="wardId"
            value={wardId}
            onChange={(e) => handleWardChange(e.target.value)}
            disabled={!subDivId || loadingWards}
            className={selectCls}
          >
            {loadingWards ? (
              <option value="">Loading Wards...</option>
            ) : !subDivId ? (
              <option value="">Select Sub-Division First</option>
            ) : wards.length === 0 ? (
              <option value="">No Wards Found</option>
            ) : (
              <>
                <option value="">—</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.new_no} · {w.new_name}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Assigned engineer" error={fe.assignedEngineerId}>
          <select
            name="assignedEngineerId"
            value={engId}
            onChange={(e) => setEngId(e.target.value)}
            disabled={!wardId || loadingContacts}
            className={selectCls}
          >
            {loadingContacts ? (
              <option value="">Loading Engineers...</option>
            ) : !wardId ? (
              <option value="">Select Ward First</option>
            ) : engineers.length === 0 ? (
              <option value="">No Engineers Found</option>
            ) : (
              <>
                <option value="">—</option>
                {engineers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {c.designation}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Assigned officer" error={fe.assignedOfficerId}>
          <select
            name="assignedOfficerId"
            value={offId}
            onChange={(e) => setOffId(e.target.value)}
            disabled={!wardId || loadingContacts}
            className={selectCls}
          >
            {loadingContacts ? (
              <option value="">Loading Officers...</option>
            ) : !wardId ? (
              <option value="">Select Ward First</option>
            ) : officers.length === 0 ? (
              <option value="">No Officers Found</option>
            ) : (
              <>
                <option value="">—</option>
                {officers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {c.designation}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Location" error={fe.locationText} className="sm:col-span-2">
          <Input name="locationText" defaultValue={initial?.location ?? ""} />
        </Field>
        <Field label="Landmark" error={fe.landmark}>
          <Input name="landmark" defaultValue={initial?.landmark ?? ""} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
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
