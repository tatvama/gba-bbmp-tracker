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
import {
  getCorporationsAction,
  getDivisionsAction,
  getSubdivisionsAction,
  getWardsAction,
  getContactsAction,
} from "@/lib/actions/complaints";

import { RtiWizardProvider, useRtiWizard } from "./rti-wizard-context";

export type RtiFormOptions = {
  corporations: { id: string; code: string; name: string }[];
  divisions: { id: string; name: string }[];
  subdivisions: { id: string; name: string }[];
  wards: { id: string; new_no: number; new_name: string }[];
  contacts: { id: string; full_name: string; designation: string }[];
};

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RtiForm(props: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: RtiFormOptions;
  initial?: RtiWithRelations;
  jobCodes?: string[];
}) {
  return (
    <RtiWizardProvider initial={props.initial}>
      <RtiFormInner {...props} />
    </RtiWizardProvider>
  );
}

function RtiFormInner({
  action,
  options,
  initial,
  jobCodes = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: RtiFormOptions;
  initial?: RtiWithRelations;
  jobCodes?: string[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  const fe = state.fieldErrors ?? {};

  const rti = initial as any;
  const { formData, updateField } = useRtiWizard();

  // Selected values
  const wardType = formData.wardType;
  const setWardType = (val: string) => updateField("wardType", val);
  const corpId = formData.corporationId;
  const setCorpId = (val: string) => updateField("corporationId", val);
  const divId = formData.divisionId;
  const setDivId = (val: string) => updateField("divisionId", val);
  const subDivId = formData.engSubDivisionId;
  const setSubDivId = (val: string) => updateField("engSubDivisionId", val);
  const wardId = formData.wardId;
  const setWardId = (val: string) => updateField("wardId", val);
  const contactId = formData.contactId;
  const setContactId = (val: string) => updateField("contactId", val);

  // Options lists
  const [corporations, setCorporations] = React.useState<{ id: string; code: string; name: string }[]>(() => {
    if (rti?.corporation_id && rti?.corporation) {
      return [{ id: rti.corporation_id, code: rti.corporation.code, name: rti.corporation.name }];
    }
    return [];
  });
  const [divisions, setDivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (rti?.ward_type === "GBA" && rti?.gba_division) {
      return [{ id: rti.gba_division, name: rti.gba_division }];
    }
    if (rti?.division_id && rti?.division) {
      return [{ id: rti.division_id, name: rti.division.name }];
    }
    return [];
  });
  const [subdivisions, setSubdivisions] = React.useState<{ id: string; name: string }[]>(() => {
    if (rti?.ward_type === "GBA" && rti?.gba_subdivision) {
      return [{ id: rti.gba_subdivision, name: rti.gba_subdivision }];
    }
    if (rti?.eng_subdivision_id && rti?.eng_subdivision) {
      return [{ id: rti.eng_subdivision_id, name: rti.eng_subdivision.name }];
    }
    return [];
  });
  const [wards, setWards] = React.useState<{ id: string; new_no: number; new_name: string }[]>(() => {
    if (rti?.ward_type === "GBA" && rti?.gba_ward_id && rti?.gba_ward) {
      return [{ id: rti.gba_ward_id, new_no: rti.gba_ward.ward_no, new_name: rti.gba_ward.ward_name_en }];
    }
    if (rti?.ward_id && rti?.ward) {
      return [{ id: rti.ward_id, new_no: rti.ward.new_no, new_name: rti.ward.new_name }];
    }
    return [];
  });
  const [contacts, setContacts] = React.useState<{ id: string; full_name: string; designation: string }[]>(() => {
    if (rti?.contact_id && rti?.contact) {
      return [{
        id: rti.contact_id,
        full_name: rti.contact.full_name,
        designation: rti.contact.designation ?? ""
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
      if (!rti) return;

      const fetches: Promise<any>[] = [];
      const currentWardType = rti.ward_type || "BBMP";

      if (rti.ward_type) {
        fetches.push(
          getCorporationsAction()
            .then(setCorporations)
            .catch((e) => console.error("Error loading initial corporations:", e))
        );
      }

      if (rti.corporation_id) {
        fetches.push(
          getDivisionsAction(rti.corporation_id, currentWardType)
            .then(setDivisions)
            .catch((e) => console.error("Error loading initial divisions:", e))
        );
      }

      const activeDivId = currentWardType === "GBA" ? rti.gba_division : rti.division_id;
      if (activeDivId && rti.corporation_id) {
        fetches.push(
          getSubdivisionsAction(activeDivId, rti.corporation_id, currentWardType)
            .then(setSubdivisions)
            .catch((e) => console.error("Error loading initial subdivisions:", e))
        );
      }

      const activeSubId = currentWardType === "GBA" ? rti.gba_subdivision : rti.eng_subdivision_id;
      if (activeSubId && activeDivId && rti.corporation_id) {
        fetches.push(
          getWardsAction(activeSubId, activeDivId, rti.corporation_id, currentWardType)
            .then(setWards)
            .catch((e) => console.error("Error loading initial wards:", e))
        );
        fetches.push(
          getContactsAction(activeSubId, currentWardType)
            .then(setContacts)
            .catch((e) => console.error("Error loading initial contacts:", e))
        );
      }

      if (fetches.length > 0) {
        await Promise.all(fetches);
      }
    }

    loadInitialData();
  }, [rti]);

  const handleWardTypeChange = async (val: string) => {
    setWardType(val);
    setCorpId("");
    setDivId("");
    setSubDivId("");
    setWardId("");
    setContactId("");
    setCorporations([]);
    setDivisions([]);
    setSubdivisions([]);
    setWards([]);
    setContacts([]);

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
    setContactId("");
    setDivisions([]);
    setSubdivisions([]);
    setWards([]);
    setContacts([]);

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
    setContactId("");
    setSubdivisions([]);
    setWards([]);
    setContacts([]);

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
    setContactId("");
    setWards([]);
    setContacts([]);

    if (val && divId && corpId) {
      setLoadingWards(true);
      setLoadingContacts(true);
      try {
        const [wrdsList, contactsList] = await Promise.all([
          getWardsAction(val, divId, corpId, wardType),
          getContactsAction(val, wardType)
        ]);
        setWards(wrdsList);
        setContacts(contactsList);
      } catch (error) {
        console.error("Failed to load wards and contacts:", error);
      } finally {
        setLoadingWards(false);
        setLoadingContacts(false);
      }
    }
  };

  const handleWardChange = async (val: string) => {
    setWardId(val);
    setContactId("");
    setContacts([]);
    if (val && subDivId) {
      setLoadingContacts(true);
      try {
        const contactsList = await getContactsAction(subDivId, wardType);
        setContacts(contactsList);
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
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Section title="Request">
        <Field label="Subject" error={fe.subject} required className="sm:col-span-2">
          <Input
            name="subject"
            value={formData.subject || ""}
            onChange={(e) => updateField("subject", e.target.value)}
            required
          />
        </Field>
        <Field label="Category" error={fe.category}>
          <select
            name="category"
            value={formData.category || ""}
            onChange={(e) => updateField("category", e.target.value)}
            className={selectCls}
          >
            <option value="">—</option>
            {RTI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority" error={fe.priority}>
          <select
            name="priority"
            value={formData.priority || "Medium"}
            onChange={(e) => updateField("priority", e.target.value)}
            className={selectCls}
          >
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status" error={fe.status}>
          <select
            name="status"
            value={formData.status || "Draft"}
            onChange={(e) => updateField("status", e.target.value)}
            className={selectCls}
          >
            {RTI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Filing mode" error={fe.filingMode}>
          <select
            name="filingMode"
            value={formData.filingMode || ""}
            onChange={(e) => updateField("filingMode", e.target.value)}
            className={selectCls}
          >
            <option value="">—</option>
            {RTI_FILING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Information requested" error={fe.infoRequested} className="sm:col-span-2">
          <Textarea
            name="infoRequested"
            value={formData.infoRequested || ""}
            onChange={(e) => updateField("infoRequested", e.target.value)}
            rows={4}
            placeholder="One information request per line."
          />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="isLifeLiberty"
            name="isLifeLiberty"
            checked={formData.isLifeLiberty || false}
            onCheckedChange={(checked) => updateField("isLifeLiberty", !!checked)}
          />
          <Label htmlFor="isLifeLiberty" className="font-normal">
            Life / liberty case (48-hour reply deadline)
          </Label>
        </div>
      </Section>

      <Section title="Jurisdiction">
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

        <Field label="Engineering sub-division" error={fe.engSubDivisionId}>
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

        <Field label="Officer on record" error={fe.contactId} className="sm:col-span-2">
          <select
            name="contactId"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            disabled={!wardId || loadingContacts}
            className={selectCls}
          >
            {loadingContacts ? (
              <option value="">Loading Officers...</option>
            ) : !wardId ? (
              <option value="">Select Ward First</option>
            ) : contacts.length === 0 ? (
              <option value="">No Officers Found</option>
            ) : (
              <>
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} — {c.designation}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>
      </Section>

      <Section title="Public authority / PIO / FAA">
        <Field label="Public authority" error={fe.publicAuthority}>
          <Input
            name="publicAuthority"
            value={formData.publicAuthority || ""}
            onChange={(e) => updateField("publicAuthority", e.target.value)}
          />
        </Field>
        <Field label="Department" error={fe.department}>
          <Input
            name="department"
            value={formData.department || ""}
            onChange={(e) => updateField("department", e.target.value)}
          />
        </Field>
        <Field label="Office address" error={fe.officeAddress} className="sm:col-span-2">
          <Textarea
            name="officeAddress"
            value={formData.officeAddress || ""}
            onChange={(e) => updateField("officeAddress", e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="PIO name" error={fe.pioName}>
          <Input
            name="pioName"
            value={formData.pioName || ""}
            onChange={(e) => updateField("pioName", e.target.value)}
          />
        </Field>
        <Field label="PIO designation" error={fe.pioDesignation}>
          <Input
            name="pioDesignation"
            value={formData.pioDesignation || ""}
            onChange={(e) => updateField("pioDesignation", e.target.value)}
          />
        </Field>
        <Field label="PIO phone" error={fe.pioPhone}>
          <Input
            name="pioPhone"
            value={formData.pioPhone || ""}
            onChange={(e) => updateField("pioPhone", e.target.value)}
          />
        </Field>
        <Field label="PIO email" error={fe.pioEmail}>
          <Input
            name="pioEmail"
            type="email"
            value={formData.pioEmail || ""}
            onChange={(e) => updateField("pioEmail", e.target.value)}
          />
        </Field>
        <Field label="FAA name" error={fe.faaName}>
          <Input
            name="faaName"
            value={formData.faaName || ""}
            onChange={(e) => updateField("faaName", e.target.value)}
          />
        </Field>
        <Field label="FAA designation" error={fe.faaDesignation}>
          <Input
            name="faaDesignation"
            value={formData.faaDesignation || ""}
            onChange={(e) => updateField("faaDesignation", e.target.value)}
          />
        </Field>
        <Field label="FAA phone" error={fe.faaPhone}>
          <Input
            name="faaPhone"
            value={formData.faaPhone || ""}
            onChange={(e) => updateField("faaPhone", e.target.value)}
          />
        </Field>
        <Field label="FAA email" error={fe.faaEmail}>
          <Input
            name="faaEmail"
            type="email"
            value={formData.faaEmail || ""}
            onChange={(e) => updateField("faaEmail", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Applicant">
        <Field label="Applicant name" error={fe.applicantName}>
          <Input
            name="applicantName"
            value={formData.applicantName || ""}
            onChange={(e) => updateField("applicantName", e.target.value)}
          />
        </Field>
        <Field label="Applicant phone" error={fe.applicantPhone}>
          <Input
            name="applicantPhone"
            value={formData.applicantPhone || ""}
            onChange={(e) => updateField("applicantPhone", e.target.value)}
          />
        </Field>
        <Field label="Applicant email" error={fe.applicantEmail}>
          <Input
            name="applicantEmail"
            type="email"
            value={formData.applicantEmail || ""}
            onChange={(e) => updateField("applicantEmail", e.target.value)}
          />
        </Field>
        <Field label="Applicant address" error={fe.applicantAddress}>
          <Input
            name="applicantAddress"
            value={formData.applicantAddress || ""}
            onChange={(e) => updateField("applicantAddress", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Filing details & dates">
        <Field label="Date drafted" error={fe.dateDrafted}>
          <Input
            type="date"
            name="dateDrafted"
            value={formData.dateDrafted || ""}
            onChange={(e) => updateField("dateDrafted", e.target.value)}
          />
        </Field>
        <Field label="Date filed" error={fe.dateFiled}>
          <Input
            type="date"
            name="dateFiled"
            value={formData.dateFiled || ""}
            onChange={(e) => updateField("dateFiled", e.target.value)}
          />
        </Field>
        <Field label="Date received by authority" error={fe.dateReceived}>
          <Input
            type="date"
            name="dateReceived"
            value={formData.dateReceived || ""}
            onChange={(e) => updateField("dateReceived", e.target.value)}
          />
        </Field>
        <Field label="Reply date" error={fe.replyDate}>
          <Input
            type="date"
            name="replyDate"
            value={formData.replyDate || ""}
            onChange={(e) => updateField("replyDate", e.target.value)}
          />
        </Field>
        <Field label="Postal receipt no." error={fe.postalReceiptNo}>
          <Input
            name="postalReceiptNo"
            value={formData.postalReceiptNo || ""}
            onChange={(e) => updateField("postalReceiptNo", e.target.value)}
          />
        </Field>
        <Field label="Online registration no." error={fe.onlineRegNo}>
          <Input
            name="onlineRegNo"
            value={formData.onlineRegNo || ""}
            onChange={(e) => updateField("onlineRegNo", e.target.value)}
          />
        </Field>
        <Field label="Job / work-order code" error={fe.jobNumber}>
          <Input
            name="jobNumber"
            list="rti-job-codes"
            value={formData.jobNumber || ""}
            onChange={(e) => updateField("jobNumber", e.target.value)}
            placeholder="Link to a job code, e.g. 225-25-001234"
            pattern="\d{3}-\d{2}-\d{6}"
          />
          {jobCodes.length > 0 && (
            <datalist id="rti-job-codes">
              {jobCodes.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          )}
        </Field>
        <Field label="Fee mode" error={fe.feeMode}>
          <Input
            name="feeMode"
            value={formData.feeMode || ""}
            onChange={(e) => updateField("feeMode", e.target.value)}
            placeholder="IPO / DD / Online / Court fee stamp"
          />
        </Field>
        <Field label="Satisfaction" error={fe.satisfactionStatus}>
          <select
            name="satisfactionStatus"
            value={formData.satisfactionStatus || ""}
            onChange={(e) => updateField("satisfactionStatus", e.target.value)}
            className={selectCls}
          >
            <option value="">—</option>
            {RTI_SATISFACTION.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="applicationFeePaid"
            name="applicationFeePaid"
            checked={formData.applicationFeePaid || false}
            onCheckedChange={(checked) => updateField("applicationFeePaid", !!checked)}
          />
          <Label htmlFor="applicationFeePaid" className="font-normal">Application fee paid</Label>
        </div>
      </Section>

      <Section title="Reply, workflow & notes">
        <Field label="Reply summary" error={fe.replySummary} className="sm:col-span-2">
          <Textarea
            name="replySummary"
            value={formData.replySummary || ""}
            onChange={(e) => updateField("replySummary", e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Next action" error={fe.nextAction}>
          <Input
            name="nextAction"
            value={formData.nextAction || ""}
            onChange={(e) => updateField("nextAction", e.target.value)}
          />
        </Field>
        <Field label="Next action date" error={fe.nextActionDate}>
          <Input
            type="date"
            name="nextActionDate"
            value={formData.nextActionDate || ""}
            onChange={(e) => updateField("nextActionDate", e.target.value)}
          />
        </Field>
        <Field label="Tags (comma-separated)" error={fe.tags} className="sm:col-span-2">
          <Input
            name="tags"
            value={formData.tags || ""}
            onChange={(e) => updateField("tags", e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="reminderEnabled"
            name="reminderEnabled"
            checked={formData.reminderEnabled || false}
            onCheckedChange={(checked) => updateField("reminderEnabled", !!checked)}
          />
          <Label htmlFor="reminderEnabled" className="font-normal">Enable deadline reminders</Label>
        </div>
        <Field label="Public notes" error={fe.publicNotes} className="sm:col-span-2">
          <Textarea
            name="publicNotes"
            value={formData.publicNotes || ""}
            onChange={(e) => updateField("publicNotes", e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Internal notes (not shown to viewers)" error={fe.internalNotes} className="sm:col-span-2">
          <Textarea
            name="internalNotes"
            value={formData.internalNotes || ""}
            onChange={(e) => updateField("internalNotes", e.target.value)}
            rows={2}
          />
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
