"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  RTI_CATEGORIES,
  RTI_FILING_MODES,
  PRIORITIES,
} from "@/lib/constants";
import { generateRtiDraft } from "@/lib/actions/ai";
import type { RtiFormOptions } from "@/components/rti/rti-form";
import type { Template } from "@/lib/types";
import type { ActionState } from "@/lib/actions/contacts";
import {
  getCorporationsAction,
  getDivisionsAction,
  getSubdivisionsAction,
  getWardsAction,
  getContactsAction,
} from "@/lib/actions/complaints";
import { RtiWizardProvider, useRtiWizard } from "./rti-wizard-context";
import { replacePlaceholdersGeneric, RTI_PLACEHOLDER_MAPPINGS } from "@/lib/placeholder-engine";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STEPS = ["Jurisdiction", "Authority & PIO", "Applicant", "Information + AI", "Filing & review"];

export function RtiWizard(props: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: RtiFormOptions;
  templates: Template[];
  aiConfigured: boolean;
}) {
  return (
    <RtiWizardProvider>
      <RtiWizardInner {...props} />
    </RtiWizardProvider>
  );
}

function RtiWizardInner({
  action,
  options,
  templates,
  aiConfigured,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: RtiFormOptions;
  templates: Template[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [step, setStep] = React.useState(0);

  const { formData, updateField } = useRtiWizard();

  const subject = formData.subject;
  const setSubject = (val: string) => updateField("subject", val);
  const category = formData.category;
  const setCategory = (val: string) => updateField("category", val);
  const facts = formData.facts;
  const setFacts = (val: string) => updateField("facts", val);
  const infoRequested = formData.infoRequested;
  const setInfoRequested = (val: string | ((prev: string) => string)) => {
    if (typeof val === "function") {
      updateField("infoRequested", val(formData.infoRequested));
    } else {
      updateField("infoRequested", val);
    }
  };

  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  // Selected values from context
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
  const [corporations, setCorporations] = React.useState<{ id: string; code: string; name: string }[]>([]);
  const [divisions, setDivisions] = React.useState<{ id: string; name: string }[]>([]);
  const [subdivisions, setSubdivisions] = React.useState<{ id: string; name: string }[]>([]);
  const [wards, setWards] = React.useState<{ id: string; new_no: number; new_name: string }[]>([]);
  const [contacts, setContacts] = React.useState<{ id: string; full_name: string; designation: string }[]>([]);

  // Loading states
  const [loadingCorps, setLoadingCorps] = React.useState(false);
  const [loadingDivs, setLoadingDivs] = React.useState(false);
  const [loadingSubs, setLoadingSubs] = React.useState(false);
  const [loadingWards, setLoadingWards] = React.useState(false);
  const [loadingContacts, setLoadingContacts] = React.useState(false);

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

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  const canNext = step !== 0 || subject.trim().length >= 3;

  function insertTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const qs = (t.default_questions ?? []).join("\n");
    const replaced = replacePlaceholdersGeneric(qs, formData, RTI_PLACEHOLDER_MAPPINGS);
    setInfoRequested((prev) => (prev.trim() ? `${prev}\n${replaced}` : replaced));
  }

  async function generate() {
    setAiBusy(true);
    setAiError(null);
    try {
      const selectedWard = wards.find((w) => w.id === wardId);
      const selectedDivision = divisions.find((d) => d.id === divId);
      const selectedContact = contacts.find((c) => c.id === contactId);

      const r = await generateRtiDraft({
        subject,
        facts,
        category: category || null,
        questions: infoRequested.split("\n").map((q) => q.trim()).filter(Boolean),
        wardName: selectedWard ? `${selectedWard.new_no} · ${selectedWard.new_name}` : null,
        divisionName: selectedDivision ? selectedDivision.name : null,
        officerName: selectedContact ? selectedContact.full_name : null,
        publicAuthority: formData.publicAuthority || null,
        pioName: formData.pioName || null,
        pioDesignation: formData.pioDesignation || null,
        applicantName: formData.applicantName || null,
      });

      if (r.ok && r.text) {
        const replaced = replacePlaceholdersGeneric(r.text, formData, RTI_PLACEHOLDER_MAPPINGS);
        setInfoRequested(replaced);
      } else {
        setAiError(r.error ?? "AI request failed.");
      }
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1",
              i === step
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : i < step
                  ? "border-teal/40 bg-teal/5 text-teal"
                  : "text-muted-foreground",
            )}
          >
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* All fields stay mounted (so the final submit posts everything); we only
          show one step at a time. */}
      <div className={cn(step !== 0 && "hidden")}>
        <StepGrid>
          <Field label="Subject" required className="sm:col-span-2">
            <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            {!canNext && step === 0 && (
              <p className="text-xs text-muted-foreground">Enter at least 3 characters.</p>
            )}
          </Field>
          <Field label="Category">
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
              <option value="">—</option>
              {RTI_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select
              name="priority"
              value={formData.priority || "Medium"}
              onChange={(e) => updateField("priority", e.target.value)}
              className={selectCls}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
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

          <Field label="Ward Type" required>
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

          <Field label="Corporation">
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

          <Field label="Division">
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

          <Field label="Engineering sub-division">
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

          <Field label="Ward">
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

          <Field label="Officer on record" className="sm:col-span-2">
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
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="wiz_life"
              name="isLifeLiberty"
              checked={formData.isLifeLiberty || false}
              onCheckedChange={(checked) => updateField("isLifeLiberty", !!checked)}
            />
            <Label htmlFor="wiz_life" className="font-normal">Life / liberty case (48-hour deadline)</Label>
          </div>
        </StepGrid>
      </div>

      <div className={cn(step !== 1 && "hidden")}>
        <StepGrid>
          <Field label="Public authority">
            <Input
              name="publicAuthority"
              value={formData.publicAuthority || ""}
              onChange={(e) => updateField("publicAuthority", e.target.value)}
            />
          </Field>
          <Field label="Department">
            <Input
              name="department"
              value={formData.department || ""}
              onChange={(e) => updateField("department", e.target.value)}
            />
          </Field>
          <Field label="Office address" className="sm:col-span-2">
            <Textarea
              name="officeAddress"
              value={formData.officeAddress || ""}
              onChange={(e) => updateField("officeAddress", e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="PIO name">
            <Input
              name="pioName"
              value={formData.pioName || ""}
              onChange={(e) => updateField("pioName", e.target.value)}
            />
          </Field>
          <Field label="PIO designation">
            <Input
              name="pioDesignation"
              value={formData.pioDesignation || ""}
              onChange={(e) => updateField("pioDesignation", e.target.value)}
            />
          </Field>
          <Field label="PIO phone">
            <Input
              name="pioPhone"
              value={formData.pioPhone || ""}
              onChange={(e) => updateField("pioPhone", e.target.value)}
            />
          </Field>
          <Field label="PIO email">
            <Input
              name="pioEmail"
              type="email"
              value={formData.pioEmail || ""}
              onChange={(e) => updateField("pioEmail", e.target.value)}
            />
          </Field>
          <Field label="FAA name">
            <Input
              name="faaName"
              value={formData.faaName || ""}
              onChange={(e) => updateField("faaName", e.target.value)}
            />
          </Field>
          <Field label="FAA designation">
            <Input
              name="faaDesignation"
              value={formData.faaDesignation || ""}
              onChange={(e) => updateField("faaDesignation", e.target.value)}
            />
          </Field>
        </StepGrid>
      </div>

      <div className={cn(step !== 2 && "hidden")}>
        <StepGrid>
          <Field label="Applicant name">
            <Input
              name="applicantName"
              value={formData.applicantName || ""}
              onChange={(e) => updateField("applicantName", e.target.value)}
            />
          </Field>
          <Field label="Applicant phone">
            <Input
              name="applicantPhone"
              value={formData.applicantPhone || ""}
              onChange={(e) => updateField("applicantPhone", e.target.value)}
            />
          </Field>
          <Field label="Applicant email">
            <Input
              name="applicantEmail"
              type="email"
              value={formData.applicantEmail || ""}
              onChange={(e) => updateField("applicantEmail", e.target.value)}
            />
          </Field>
          <Field label="Applicant address">
            <Input
              name="applicantAddress"
              value={formData.applicantAddress || ""}
              onChange={(e) => updateField("applicantAddress", e.target.value)}
            />
          </Field>
        </StepGrid>
      </div>

      <div className={cn("space-y-4", step !== 3 && "hidden")}>
        <Field label="Background facts (used for the AI draft; not stored verbatim)">
          <Textarea value={facts} onChange={(e) => setFacts(e.target.value)} rows={4} placeholder="What happened, when, where, which work/contractor, what you suspect…" />
        </Field>
        {templates.length > 0 && (
          <Field label="Insert questions from a template">
            <select className={selectCls} defaultValue="" onChange={(e) => { insertTemplate(e.target.value); e.target.value = ""; }}>
              <option value="" disabled>Choose a template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        )}
        <Field label="Information requested (one per line)">
          <Textarea name="infoRequested" value={infoRequested} onChange={(e) => setInfoRequested(e.target.value)} rows={10} className="font-mono text-sm" />
        </Field>
        {aiConfigured ? (
          <div className="space-y-2">
            <Button type="button" variant="outline" onClick={generate} disabled={aiBusy || subject.trim().length < 3}>
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate full RTI draft with AI
            </Button>
            {aiError && <p className="text-xs text-destructive">{aiError}</p>}
            <p className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
              ⚠ Review before filing — the generated text is editable and is never filed automatically.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            AI not configured — write the information requests above manually, or use a template.
          </p>
        )}
      </div>

      <div className={cn(step !== 4 && "hidden")}>
        <StepGrid>
          <Field label="Filing mode">
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
          <Field label="Status">
            <select
              name="status"
              value={formData.status || "Draft"}
              onChange={(e) => updateField("status", e.target.value)}
              className={selectCls}
            >
              <option value="Draft">Draft</option>
              <option value="Ready to File">Ready to File</option>
              <option value="Filed">Filed</option>
            </select>
          </Field>
          <Field label="Date drafted">
            <Input type="date" name="dateDrafted" value={formData.dateDrafted || ""} onChange={(e) => updateField("dateDrafted", e.target.value)} />
          </Field>
          <Field label="Date filed">
            <Input type="date" name="dateFiled" value={formData.dateFiled || ""} onChange={(e) => updateField("dateFiled", e.target.value)} />
          </Field>
          <Field label="Date received by authority">
            <Input type="date" name="dateReceived" value={formData.dateReceived || ""} onChange={(e) => updateField("dateReceived", e.target.value)} />
          </Field>
          <Field label="Postal receipt no.">
            <Input name="postalReceiptNo" value={formData.postalReceiptNo || ""} onChange={(e) => updateField("postalReceiptNo", e.target.value)} />
          </Field>
          <Field label="Online registration no.">
            <Input name="onlineRegNo" value={formData.onlineRegNo || ""} onChange={(e) => updateField("onlineRegNo", e.target.value)} />
          </Field>
          <Field label="Fee mode">
            <Input name="feeMode" value={formData.feeMode || ""} onChange={(e) => updateField("feeMode", e.target.value)} />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wiz_fee"
              name="applicationFeePaid"
              checked={formData.applicationFeePaid || false}
              onCheckedChange={(checked) => updateField("applicationFeePaid", !!checked)}
            />
            <Label htmlFor="wiz_fee" className="font-normal">Application fee paid</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wiz_rem"
              name="reminderEnabled"
              checked={formData.reminderEnabled !== false}
              onCheckedChange={(checked) => updateField("reminderEnabled", !!checked)}
            />
            <Label htmlFor="wiz_rem" className="font-normal">Enable deadline reminders</Label>
          </div>
        </StepGrid>
        <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">Review</p>
          <p className="mt-1 text-muted-foreground">Subject: {subject || "—"}</p>
          <p className="text-muted-foreground">Category: {category || "—"}</p>
          <p className="text-muted-foreground">
            {infoRequested.split("\n").filter((l) => l.trim()).length} information request(s).
            Deadlines are computed automatically from the dates above.
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create RTI"}
          </Button>
        )}
      </div>
    </form>
  );
}

function StepGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
