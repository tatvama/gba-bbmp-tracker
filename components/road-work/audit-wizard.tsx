"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Check, Loader2, Upload, FileText, Sparkles,
  AlertTriangle, ScanLine, Copy, Printer, FileCheck, ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SuspicionReview } from "./suspicion-review";
import { RecipientPicker, type RecipientValue } from "./recipient-picker";
import { SenderPicker, type SenderValue } from "./sender-picker";
import { ROAD_WORK_180 } from "@/lib/ai/road-work-questions";
import { preselectSuspicions, mergeSuspicions, type SuspicionMatch } from "@/lib/ai/suspicion-select";
import { flagSummaryForCodes } from "@/lib/letters/from-suspicions";
import { LETTER_SIGNATORIES, type SignatoryKey, type LetterVariant } from "@/lib/constants";
import { suggestSuspicions, saveAiDraft } from "@/lib/actions/ai";
import { generateAuditLetter, saveAuditIntake, type AuditIntake, type AuditLetterResult } from "@/lib/actions/audit-letter";
import { createRti } from "@/lib/actions/rti";
import { createComplaint } from "@/lib/actions/complaints";
import type { RecipientOfficer } from "@/lib/queries";

interface WardOption { id: string; new_no: number; new_name: string }
type OutputType = "rti" | "complaint";
type Language = "English" | "Kannada" | "Bilingual";

const STEPS = ["Output & subject", "Evidence", "Review suspicions", "To Whom", "From Whom", "Review & generate"];
const selectCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ALL_CODES = ROAD_WORK_180.flatMap((s) => s.questions.filter((q): q is { code: string; en: string; kn: string; severity: "RED" | "ORANGE" | "AMBER" } => "code" in q).map((q) => q.code));

const COMPLAINT_VARIANTS: { value: LetterVariant; label: string }[] = [
  { value: "bill_stop", label: "Bill-stop notice" },
  { value: "lokayukta", label: "Lokayukta complaint" },
  { value: "bilingual_summary", label: "Forensic summary" },
];

export function AuditWizard({
  defaultOutputType,
  wards,
  officers,
  aiConfigured,
}: {
  defaultOutputType: OutputType;
  wards: WardOption[];
  officers: RecipientOfficer[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  // Step 0
  const [outputType, setOutputType] = React.useState<OutputType>(defaultOutputType);
  const [variant, setVariant] = React.useState<LetterVariant>("bill_stop");
  const [language, setLanguage] = React.useState<Language>("Kannada");
  const [wardId, setWardId] = React.useState("");
  const [jobNumber, setJobNumber] = React.useState("");
  const [roadName, setRoadName] = React.useState("");
  const [contractor, setContractor] = React.useState("");

  // Step 1
  const [mode, setMode] = React.useState<"summary" | "upload">("summary");
  const [summary, setSummary] = React.useState("");
  const [workOrderExtract, setWorkOrderExtract] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [uploadMsg, setUploadMsg] = React.useState<string | null>(null);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);
  const [finding, setFinding] = React.useState(false);

  // Step 2 — suspicions
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [reasons, setReasons] = React.useState<Record<string, string>>({});

  // Step 3 / 4
  const [recipientValue, setRecipientValue] = React.useState<RecipientValue>({
    recipient: { name: "", designation: "", office: "", address: "" },
    ccChain: [],
  });
  const [senderValue, setSenderValue] = React.useState<SenderValue>({
    signatoryKey: (Object.keys(LETTER_SIGNATORIES)[0] as SignatoryKey) ?? null,
  });

  // Step 5 — generation
  const [genBusy, setGenBusy] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [genResult, setGenResult] = React.useState<AuditLetterResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approving, setApproving] = React.useState(false);

  const wardName = React.useMemo(() => {
    const w = wards.find((x) => x.id === wardId);
    return w ? `${w.new_no} — ${w.new_name}` : null;
  }, [wardId, wards]);

  const codes = React.useMemo(() => Object.keys(selected).filter((c) => selected[c]), [selected]);
  const flags = React.useMemo(() => flagSummaryForCodes(codes), [codes]);

  // ── handlers ──────────────────────────────────────────────────────────────
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setUploadErr(null);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/ocr/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setUploadErr(json.error ?? "OCR failed.");
        return;
      }
      setWorkOrderExtract(json.ocrText ?? "");
      const ex = json.extraction ?? {};
      if (ex.jobNumber) setJobNumber(ex.jobNumber);
      if (ex.roadName) setRoadName(ex.roadName);
      if (ex.contractorName) setContractor(ex.contractorName);
      if (ex.summary && !summary) setSummary(ex.summary);
      if (ex.wardNumber) {
        const n = parseInt(String(ex.wardNumber).replace(/\D/g, ""), 10);
        const w = wards.find((x) => x.new_no === n);
        if (w) setWardId(w.id);
      }
      setUploadMsg(json.extractionOk ? "Work order read — details prefilled. Review below." : "OCR done — fill details manually.");
    } catch {
      setUploadErr("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function findSuspicions() {
    setFinding(true);
    try {
      const text = `${summary}\n${workOrderExtract}`;
      let matches: SuspicionMatch[] = preselectSuspicions(text);
      if (aiConfigured && (summary.trim() || workOrderExtract.trim())) {
        const ai = await suggestSuspicions({ summary, workOrderExtract, outputType });
        if (ai.ok && ai.codes?.length) matches = mergeSuspicions(matches, ai.codes);
      }
      const nextSel: Record<string, boolean> = {};
      const nextReasons: Record<string, string> = {};
      for (const m of matches) {
        nextSel[m.code] = true;
        nextReasons[m.code] = m.reason;
      }
      setSelected(nextSel);
      setReasons(nextReasons);
      setStep(2);
    } finally {
      setFinding(false);
    }
  }

  function toggle(code: string) {
    setSelected((s) => ({ ...s, [code]: !s[code] }));
  }
  function setNote(code: string, text: string) {
    setNotes((n) => ({ ...n, [code]: text }));
  }
  function selectAll() {
    const all: Record<string, boolean> = {};
    for (const c of ALL_CODES) all[c] = true;
    setSelected(all);
  }
  function clearAll() {
    setSelected({});
  }

  function buildIntake(): AuditIntake {
    const r = recipientValue.recipient;
    const hasRecipient = !!(r.name || r.office || r.designation);
    const cc = recipientValue.ccChain.filter((x) => x.name || x.designation || x.office);
    return {
      outputType,
      language,
      variant: outputType === "rti" ? "rti" : variant,
      summary: summary || null,
      workOrderExtract: workOrderExtract || null,
      wardName,
      jobNumber: jobNumber || null,
      roadName: roadName || null,
      contractor: contractor || null,
      scope: codes.length === ALL_CODES.length ? "all" : "smart",
      selectedCodes: codes,
      notes,
      recipient: hasRecipient ? r : null,
      ccChain: cc.length ? cc : null,
      sender: senderValue,
      useAi: aiConfigured,
    };
  }

  async function generate() {
    setGenBusy(true);
    setError(null);
    try {
      const r = await generateAuditLetter(buildIntake());
      if (r.ok && r.text) {
        setDraft(r.text);
        setGenResult(r);
      } else {
        setError(r.error ?? "Generation failed.");
      }
    } finally {
      setGenBusy(false);
    }
  }

  async function onApprove() {
    if (!draft.trim()) return;
    setApproving(true);
    setError(null);
    try {
      const subjectBase = roadName || wardName || "BBMP road work";
      const ref = jobNumber ? ` (${jobNumber})` : "";
      const r = recipientValue.recipient;
      let entityId: string | undefined;

      if (outputType === "rti") {
        const fd = new FormData();
        fd.set("subject", `Road work audit RTI — ${subjectBase}${ref}`);
        fd.set("infoRequested", draft);
        fd.set("category", "Road work");
        fd.set("status", "Draft");
        fd.set("priority", "Medium");
        if (wardId) fd.set("wardId", wardId);
        if (r.name) fd.set("pioName", r.name);
        if (r.office) fd.set("publicAuthority", r.office);
        if (r.address) fd.set("officeAddress", r.address);
        if (senderValue.name) fd.set("applicantName", senderValue.name);
        const res = await createRti({}, fd);
        if (!res.success || !res.id) { setError(res.error ?? "Could not create RTI."); return; }
        entityId = res.id;
      } else {
        const fd = new FormData();
        fd.set("title", `Road work audit — ${subjectBase}${ref}`);
        fd.set("type", "Road");
        fd.set("status", "Draft");
        fd.set("priority", "Medium");
        fd.set("description", draft);
        if (wardId) fd.set("wardId", wardId);
        if (roadName) fd.set("locationText", roadName);
        if (jobNumber) fd.set("jobNumber", jobNumber);
        if (contractor) fd.set("contractor", contractor);
        if (r.name || r.office) fd.set("complaintFiledTo", [r.name, r.office].filter(Boolean).join(", "));
        fd.set("requestedAction", `Inquiry, fixing of officer liability and recovery for ${jobNumber || subjectBase}`);
        const res = await createComplaint({}, fd);
        if (!res.success || !res.id) { setError(res.error ?? "Could not create complaint."); return; }
        entityId = res.id;
      }

      const kind = outputType === "rti" ? "road_work_audit_rti" : "road_work_audit_complaint";
      const saved = await saveAiDraft({ entityType: outputType, entityId, kind, content: draft, language });
      await saveAuditIntake({
        outputType,
        entityType: outputType,
        entityId,
        jobNumber: jobNumber || null,
        wardId: wardId || null,
        roadName: roadName || null,
        contractor: contractor || null,
        language,
        scope: codes.length === ALL_CODES.length ? "all" : "smart",
        selectedCodes: codes,
        notes,
        recipient: buildIntake().recipient,
        ccChain: buildIntake().ccChain,
        sender: senderValue,
        flagSummary: flags,
        skeleton: genResult?.skeleton ?? null,
        content: draft,
        aiDraftId: saved.ok ? saved.id : null,
      });

      router.push(outputType === "rti" ? `/rti/${entityId}` : `/complaints/${entityId}`);
    } finally {
      setApproving(false);
    }
  }

  // ── step gating ─────────────────────────────────────────────────────────
  const canNext =
    step === 0 ? Boolean(wardId || jobNumber.trim() || roadName.trim())
    : step === 2 ? codes.length > 0
    : step === 3 ? Boolean(recipientValue.recipient.name || recipientValue.recipient.office)
    : step === 4 ? Boolean(senderValue.signatoryKey || senderValue.name?.trim())
    : true;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1",
              i === step ? "border-primary bg-primary/10 font-semibold text-primary"
                : i < step ? "border-teal/40 bg-teal/5 text-teal" : "text-muted-foreground",
            )}
          >
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {/* STEP 0 */}
      {step === 0 && (
        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block text-sm font-medium">What do you want to produce?</Label>
            <div className="inline-flex rounded-lg border bg-muted p-1 text-sm">
              {(["rti", "complaint"] as OutputType[]).map((t) => (
                <button key={t} type="button" onClick={() => setOutputType(t)}
                  className={cn("rounded-md px-3 py-1.5 font-medium", outputType === t ? "bg-background shadow-sm" : "text-muted-foreground")}>
                  {t === "rti" ? "RTI application" : "Complaint / letter"}
                </button>
              ))}
            </div>
          </div>
          {outputType === "complaint" && (
            <div>
              <Label className="mb-1.5 block text-sm font-medium">Letter type</Label>
              <select className={selectCls} value={variant} onChange={(e) => setVariant(e.target.value as LetterVariant)}>
                {COMPLAINT_VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Language</Label>
            <select className={selectCls} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
              <option value="Bilingual">Bilingual</option>
              <option value="English">English</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Ward</Label>
            <select className={selectCls} value={wardId} onChange={(e) => setWardId(e.target.value)}>
              <option value="">— Select ward —</option>
              {wards.map((w) => <option key={w.id} value={w.id}>{w.new_no} — {w.new_name}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Work / job number</Label>
            <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. 225-12-345678" />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Road / location</Label>
            <Input value={roadName} onChange={(e) => setRoadName(e.target.value)} placeholder="e.g. 5th Cross, XYZ Layout" />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm font-medium">Contractor (if known)</Label>
            <Input value={contractor} onChange={(e) => setContractor(e.target.value)} placeholder="optional" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">Provide at least a ward, job number, or road to continue.</p>
        </div>
      )}

      {/* STEP 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="inline-flex rounded-lg border bg-muted p-1 text-sm">
            <button type="button" onClick={() => setMode("summary")} className={cn("rounded-md px-3 py-1.5 font-medium", mode === "summary" ? "bg-background shadow-sm" : "text-muted-foreground")}>
              <FileText className="mr-1 inline h-4 w-4" /> Type a summary
            </button>
            <button type="button" onClick={() => setMode("upload")} className={cn("rounded-md px-3 py-1.5 font-medium", mode === "upload" ? "bg-background shadow-sm" : "text-muted-foreground")}>
              <Upload className="mr-1 inline h-4 w-4" /> Upload work order
            </button>
          </div>
          {mode === "upload" && (
            <div className="rounded-xl border bg-card p-4">
              <Label className="mb-1.5 block text-sm font-medium">Work order / estimate / bill (JPG, PNG, WebP or PDF)</Label>
              <div className="flex items-center gap-3">
                <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} disabled={uploading} className="max-w-sm" />
                {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {uploadMsg && <p className="mt-2 flex items-center gap-1.5 text-xs text-teal"><ScanLine className="h-3.5 w-3.5" /> {uploadMsg}</p>}
              {uploadErr && <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {uploadErr}</p>}
            </div>
          )}
          <div className="rounded-xl border bg-card p-4">
            <Label htmlFor="aw-summary" className="mb-1.5 block text-sm font-medium">Short summary of the issue</Label>
            <Textarea id="aw-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={4}
              placeholder="e.g. BC overlay billed but thickness looks short; no royalty challan; geo-tag photos missing; bill near payment." />
          </div>
          <Button type="button" onClick={findSuspicions} disabled={finding}>
            {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiConfigured ? "Find suspicions (smart + AI)" : "Find suspicions"}
          </Button>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{codes.length} selected</span>
              <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">RED {flags.red}</span>
              <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-0.5 text-xs font-semibold text-amber-dark">ORANGE {flags.orange}</span>
              <span className="rounded border px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">AMBER {flags.amber}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAll}>Select all 180</Button>
              <Button type="button" variant="outline" size="sm" onClick={clearAll}>Clear</Button>
            </div>
          </div>
          <SuspicionReview selected={selected} notes={notes} reasons={reasons} onToggle={toggle} onNote={setNote} />
        </div>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <RecipientPicker officers={officers} outputType={outputType} division={null} value={recipientValue} onChange={setRecipientValue} />
      )}

      {/* STEP 4 */}
      {step === 4 && <SenderPicker value={senderValue} onChange={setSenderValue} />}

      {/* STEP 5 */}
      {step === 5 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
            <span className="font-medium">Flags:</span>
            <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">RED {flags.red}</span>
            <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-0.5 text-xs font-semibold text-amber-dark">ORANGE {flags.orange}</span>
            <span className="rounded border px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">AMBER {flags.amber}</span>
            <span className="ml-auto text-xs text-muted-foreground">{outputType === "rti" ? "RTI application" : COMPLAINT_VARIANTS.find((v) => v.value === variant)?.label} · {language}</span>
          </div>

          {!aiConfigured && (
            <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
              <AlertTriangle className="mb-1 h-4 w-4" /> AI not configured — a safe deterministic draft is built from your selected suspicions. Set <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> for AI polish.
            </div>
          )}
          {genResult?.aiDiscarded && (
            <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
              <AlertTriangle className="mb-1 h-4 w-4" /> The AI draft tripped the safe-language check, so a safe deterministic version is shown instead.
            </div>
          )}

          <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
            ⚠ Review before filing — drafts are starting points only and are never filed automatically.
          </div>

          <Button type="button" onClick={generate} disabled={genBusy}>
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {draft ? "Regenerate draft" : "Generate draft"}
          </Button>

          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={20}
            placeholder="The generated draft appears here and is fully editable…" className="font-mono text-sm" />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(draft)} disabled={!draft}><Copy className="h-4 w-4" /> Copy</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!draft}><Printer className="h-4 w-4" /> Print / PDF</Button>
            <Button size="sm" onClick={onApprove} disabled={!draft || approving} className="ml-auto">
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
              {approving ? "Creating…" : outputType === "rti" ? "Approve & create RTI" : "Approve & create complaint"}
            </Button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 && (
          <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={!canNext}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
