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

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STEPS = ["Jurisdiction", "Authority & PIO", "Applicant", "Information + AI", "Filing & review"];

export function RtiWizard({
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

  // Controlled fields needed for the AI prompt / validation.
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [facts, setFacts] = React.useState("");
  const [infoRequested, setInfoRequested] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state.success && state.id) router.push(`/rti/${state.id}`);
  }, [state, router]);

  const canNext = step !== 0 || subject.trim().length >= 3;

  function insertTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const qs = (t.default_questions ?? []).join("\n");
    setInfoRequested((prev) => (prev.trim() ? `${prev}\n${qs}` : qs));
  }

  async function generate() {
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await generateRtiDraft({
        subject,
        facts,
        category: category || null,
        questions: infoRequested.split("\n").map((q) => q.trim()).filter(Boolean),
      });
      if (r.ok && r.text) setInfoRequested(r.text);
      else setAiError(r.error ?? "AI request failed.");
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
            <select name="priority" defaultValue="Medium" className={selectCls}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Corporation">
            <select name="corporationId" className={selectCls}>
              <option value="">—</option>
              {options.corporations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Division">
            <select name="divisionId" className={selectCls}>
              <option value="">—</option>
              {options.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Engineering sub-division">
            <select name="engSubDivisionId" className={selectCls}>
              <option value="">—</option>
              {options.subdivisions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Ward">
            <select name="wardId" className={selectCls}>
              <option value="">—</option>
              {options.wards.map((w) => <option key={w.id} value={w.id}>{w.new_no} · {w.new_name}</option>)}
            </select>
          </Field>
          <Field label="Officer on record" className="sm:col-span-2">
            <select name="contactId" className={selectCls}>
              <option value="">—</option>
              {options.contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name} — {c.designation}</option>)}
            </select>
          </Field>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="wiz_life" name="isLifeLiberty" />
            <Label htmlFor="wiz_life" className="font-normal">Life / liberty case (48-hour deadline)</Label>
          </div>
        </StepGrid>
      </div>

      <div className={cn(step !== 1 && "hidden")}>
        <StepGrid>
          <Field label="Public authority"><Input name="publicAuthority" /></Field>
          <Field label="Department"><Input name="department" /></Field>
          <Field label="Office address" className="sm:col-span-2"><Textarea name="officeAddress" rows={2} /></Field>
          <Field label="PIO name"><Input name="pioName" /></Field>
          <Field label="PIO designation"><Input name="pioDesignation" /></Field>
          <Field label="PIO phone"><Input name="pioPhone" /></Field>
          <Field label="PIO email"><Input name="pioEmail" type="email" /></Field>
          <Field label="FAA name"><Input name="faaName" /></Field>
          <Field label="FAA designation"><Input name="faaDesignation" /></Field>
        </StepGrid>
      </div>

      <div className={cn(step !== 2 && "hidden")}>
        <StepGrid>
          <Field label="Applicant name"><Input name="applicantName" /></Field>
          <Field label="Applicant phone"><Input name="applicantPhone" /></Field>
          <Field label="Applicant email"><Input name="applicantEmail" type="email" /></Field>
          <Field label="Applicant address"><Input name="applicantAddress" /></Field>
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
            <select name="filingMode" className={selectCls}>
              <option value="">—</option>
              {RTI_FILING_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="Draft" className={selectCls}>
              <option value="Draft">Draft</option>
              <option value="Ready to File">Ready to File</option>
              <option value="Filed">Filed</option>
            </select>
          </Field>
          <Field label="Date drafted"><Input type="date" name="dateDrafted" /></Field>
          <Field label="Date filed"><Input type="date" name="dateFiled" /></Field>
          <Field label="Date received by authority"><Input type="date" name="dateReceived" /></Field>
          <Field label="Postal receipt no."><Input name="postalReceiptNo" /></Field>
          <Field label="Online registration no."><Input name="onlineRegNo" /></Field>
          <Field label="Fee mode"><Input name="feeMode" /></Field>
          <div className="flex items-center gap-2">
            <Checkbox id="wiz_fee" name="applicationFeePaid" />
            <Label htmlFor="wiz_fee" className="font-normal">Application fee paid</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="wiz_rem" name="reminderEnabled" defaultChecked />
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
