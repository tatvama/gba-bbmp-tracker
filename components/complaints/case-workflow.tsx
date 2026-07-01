"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send, FileCheck2, MessageSquareReply, Gavel, Loader2, Save, ScrollText, AlertTriangle, Check, ChevronRight,
  FileText, Eye, Search, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScanCapture } from "@/components/complaints/scan-capture";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { LetterDraftArea } from "@/components/complaints/letter-preview";
import { printLetter } from "@/lib/print-letter";
import {
  setComplaintStatus,
  fileComplaint,
  generateComplaintDraft,
  saveComplaintAiDraft,
  addComplaintEscalation,
} from "@/lib/actions/complaints";
import { analyzeReplyGapAction } from "@/lib/actions/lifecycle";
import type { ReplyGap } from "@/lib/ai/reply-gap-analyzer";
import { COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";

export interface WorkflowLetter {
  text: string | null;
  docxDocId: string | null;
  pdfDocId: string | null;
  fileName: string | null;
}

const SUBMIT_CHANNELS = [
  "By hand (acknowledged copy)",
  "RPAD / Speed post",
  "Email",
  "PGR / Sahaaya portal",
  "Other",
] as const;

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STEPS = [
  { key: "submit", label: "Submit", icon: Send },
  { key: "acknowledge", label: "Acknowledge", icon: FileCheck2 },
  { key: "reply", label: "Reply / report", icon: MessageSquareReply },
  { key: "escalate", label: "Escalate", icon: Gavel },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/** Map a complaint status to the furthest workflow step it has reached (0-based). */
function stepFromStatus(status: string): number {
  const s = status.toLowerCase();
  if (s === "escalated" || s.includes("rti")) return 3;
  if (s.includes("reply") || s.includes("action taken") || s.includes("resolved") || s === "closed" || s.includes("partially")) return 2;
  if (s === "acknowledged" || s.includes("review") || s.includes("assigned") || s.includes("site visit") || s.includes("work in progress")) return 1;
  if (s === "filed") return 1;
  return 0; // Draft / unknown
}

const ESCALATION_OPTIONS: { kind: ComplaintDraftKind; toLevel: string }[] = [
  { kind: "records_preservation", toLevel: "EE" },
  { kind: "escalation_letter", toLevel: "EE" },
  { kind: "lokayukta_complaint", toLevel: "Lokayukta" },
  { kind: "chief_secretary_letter", toLevel: "Chief Secretary" },
];

export function CaseWorkflow({
  complaintId,
  status,
  jobNumber,
  caseNumber,
  aiConfigured,
  letter,
}: {
  complaintId: string;
  status: string;
  jobNumber: string | null;
  caseNumber: string | null;
  aiConfigured: boolean;
  letter?: WorkflowLetter | null;
}) {
  const router = useRouter();
  const reached = stepFromStatus(status);
  const [active, setActive] = React.useState<StepKey>(STEPS[Math.min(reached, 3)]!.key);
  const [busy, setBusy] = React.useState(false);

  async function mark(next: string) {
    setBusy(true);
    await setComplaintStatus(complaintId, next);
    setBusy(false);
    router.refresh();
  }

  return (
    <Card className="no-print mb-4">
      <CardContent className="py-4">
        {/* Step header */}
        <div className="mb-4 flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < reached;
            const isActive = s.key === active;
            return (
              <React.Fragment key={s.key}>
                <button
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : done ? "text-emerald-600 hover:bg-muted" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Active step panel */}
        {active === "submit" && (
          <SubmitPanel
            complaintId={complaintId}
            jobNumber={jobNumber}
            letter={letter ?? null}
            filed={reached >= 1}
            onFiled={() => router.refresh()}
          />
        )}

        {active === "acknowledge" && (
          <StepPanel title="Upload the acknowledgement" hint="Scan or photograph the officer's acknowledgement / “forwarded to the concerned officer” slip. It is OCR'd and AI-summarised.">
            <ScanCapture
              complaintId={complaintId}
              docTypes={["Complaint acknowledgement", "Postal receipt", "Email printout", "Portal screenshot"]}
              defaultDocType="Complaint acknowledgement"
            />
            <div className="mt-3">
              <Button size="sm" variant="outline" disabled={busy || reached >= 1} onClick={() => mark("Acknowledged")}>
                <FileCheck2 className="h-4 w-4" /> Mark acknowledged
              </Button>
            </div>
          </StepPanel>
        )}

        {active === "reply" && (
          <StepPanel title="Upload the department reply / report" hint="After some days the department replies or files an Action Taken Report. Capture it here; OCR + AI extract the reply and any pending issues.">
            <ScanCapture
              complaintId={complaintId}
              docTypes={["Department reply", "Engineer reply", "Action Taken Report", "Site inspection note"]}
              defaultDocType="Department reply"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => mark("Reply Received")}>
                <MessageSquareReply className="h-4 w-4" /> Mark reply received
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => mark("Action Taken Report Received")}>
                <FileCheck2 className="h-4 w-4" /> Mark ATR received
              </Button>
            </div>

            <div className="mt-4 border-t pt-4">
              <CounterReplyPanel complaintId={complaintId} aiConfigured={aiConfigured} />
            </div>
          </StepPanel>
        )}

        {active === "escalate" && (
          <EscalatePanel complaintId={complaintId} caseNumber={caseNumber} aiConfigured={aiConfigured} onEscalated={() => router.refresh()} />
        )}
      </CardContent>
    </Card>
  );
}

function StepPanel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Submit step: shows the complaint letter that the forensic ZIP already drafted
 * (view/download the PDF+DOCX, read the Kannada text inline) — NOT a generator —
 * then records how/when it was actually submitted to the officer.
 */
function SubmitPanel({
  complaintId,
  jobNumber,
  letter,
  filed,
  onFiled,
}: {
  complaintId: string;
  jobNumber: string | null;
  letter: WorkflowLetter | null;
  filed: boolean;
  onFiled: () => void;
}) {
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);
  const [submittedDate, setSubmittedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = React.useState<string>(SUBMIT_CHANNELS[0]);
  const [referenceNo, setReferenceNo] = React.useState("");
  const [filedTo, setFiledTo] = React.useState("");
  const [followUpDays, setFollowUpDays] = React.useState("30");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasLetter = Boolean(letter && (letter.text || letter.pdfDocId || letter.docxDocId));

  async function submit() {
    setBusy(true);
    setError(null);
    const r = await fileComplaint({
      complaintId,
      submittedDate,
      channel,
      filedTo: filedTo || null,
      referenceNo: referenceNo || null,
      followUpDays: parseInt(followUpDays, 10) || null,
    });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    onFiled();
  }

  return (
    <StepPanel
      title="Submit the drafted letter to the concerned officer"
      hint="This letter was drafted in your forensic audit and is attached below — print/download it, submit it, then record how and when it went out."
    >
      {/* The letter from the ZIP */}
      {hasLetter ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{letter?.fileName || "Drafted complaint letter"}</span>
            <Badge variant="muted" className="text-[10px]">from forensic audit</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {letter?.pdfDocId && (
              <Button size="sm" variant="outline" onClick={() => setViewTarget({ documentId: letter.pdfDocId!, title: letter.fileName || "Complaint letter", mimeType: "application/pdf", fileName: letter.fileName })}>
                <Eye className="h-4 w-4" /> View letter (PDF)
              </Button>
            )}
            {letter?.docxDocId && (
              <Button size="sm" variant="outline" onClick={() => setViewTarget({ documentId: letter.docxDocId!, title: letter.fileName || "Complaint letter", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName: letter.fileName, fallbackText: letter.text })}>
                <FileText className="h-4 w-4" /> Read / download DOCX
              </Button>
            )}
            {letter?.text && !letter?.pdfDocId && !letter?.docxDocId && (
              <Button size="sm" variant="outline" onClick={() => setViewTarget({ documentId: "", title: "Complaint letter", fallbackText: letter.text })}>
                <ScrollText className="h-4 w-4" /> Read letter text
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          No drafted letter is attached to this complaint yet.
          {jobNumber && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/letter`}><ScrollText className="h-4 w-4" /> Draft one</Link>
            </Button>
          )}
        </div>
      )}

      {/* Record the submission */}
      {filed ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> This complaint is marked as filed. Move to the Acknowledge step when you receive the officer&apos;s acknowledgement.</p>
      ) : (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-xs font-medium">Have you submitted this letter? Record it:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Submitted on</Label>
              <input type="date" value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)} className={selectCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <select className={selectCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
                {SUBMIT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Filed to (officer / office)</Label>
              <input type="text" value={filedTo} onChange={(e) => setFiledTo(e.target.value)} placeholder="e.g. Executive Engineer, Gottigere" className={selectCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Acknowledgement / reference no.</Label>
              <input type="text" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Inward / RPAD / portal no." className={selectCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Follow up after (days)</Label>
              <input type="number" min={1} value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} className={selectCls} />
            </div>
          </div>
          {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}
          <Button size="sm" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mark as filed (submitted)
          </Button>
        </div>
      )}

      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
    </StepPanel>
  );
}

/**
 * Reply step add-on: after the officer's reply/report is uploaded, analyse what
 * the reply left unaddressed and draft a counter-reply / cross-question letter
 * from it (reuses the counter_reply AI draft kind + the reply-gap analyser).
 */
function CounterReplyPanel({ complaintId, aiConfigured }: { complaintId: string; aiConfigured: boolean }) {
  const [gap, setGap] = React.useState<ReplyGap | null>(null);
  const [analysing, setAnalysing] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pastedReply, setPastedReply] = React.useState("");
  const [lintWarning, setLintWarning] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);

  async function analyse() {
    setAnalysing(true);
    setError(null);
    setSavedMsg(null);
    // Uses pasted text if given, else the latest uploaded/OCR'd reply on the case.
    const r = await analyzeReplyGapAction({ complaintId, replyText: pastedReply.trim() || undefined });
    setAnalysing(false);
    if (!r.ok || !r.data) { setError(r.error ?? "Could not analyse the reply."); return; }
    setGap(r.data);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setSavedMsg(null);
    setLintWarning(null);
    const r = await generateComplaintDraft({ complaintId, kind: "counter_reply" });
    setGenerating(false);
    if (!r.ok || !r.text) { setError(r.error ?? "Could not generate the counter-reply (is the AI key configured?)."); return; }
    setDraft(r.text);
    setLintWarning(r.lintWarning ?? null);
  }

  async function save() {
    if (!draft.trim()) return;
    setError(null);
    const r = await saveComplaintAiDraft({ complaintId, kind: "counter_reply", title: COMPLAINT_DRAFT_KINDS.counter_reply, content: draft });
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    setSavedMsg("Counter-reply saved to the case (AI drafts).");
  }

  const gapStyle: Record<string, string> = {
    unaddressed: "text-rose-600 dark:text-rose-400",
    partial: "text-amber-600 dark:text-amber-400",
    addressed: "text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">Counter-reply / cross-question</h4>
        <p className="text-xs text-muted-foreground">Once the reply/report is uploaded above, see what it left unaddressed and draft a counter-reply from the gaps.</p>
      </div>
      {!aiConfigured && (
        <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> AI is not configured — set ANTHROPIC_API_KEY to analyse replies and draft counter-replies.
        </p>
      )}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Paste the officer&apos;s reply (optional — otherwise the latest uploaded reply is used)</Label>
        <textarea
          value={pastedReply}
          onChange={(e) => setPastedReply(e.target.value)}
          rows={3}
          placeholder="Paste the reply text here to analyse it directly…"
          className="w-full rounded-md border border-input bg-background p-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!aiConfigured || analysing} onClick={analyse}>
          {analysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analyse what the reply left unaddressed
        </Button>
        <Button size="sm" variant="outline" disabled={!aiConfigured || generating} onClick={generate}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareReply className="h-4 w-4" />} Generate counter-reply
        </Button>
      </div>

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {gap && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-xs">
          {gap.summary && <p className="text-muted-foreground">{gap.summary}</p>}
          <p className="font-medium">{gap.unaddressedCount} demand(s) unaddressed{gap.escalationRecommended ? " — escalation recommended" : ""}.</p>
          <ul className="space-y-1">
            {gap.points.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <span className={`font-semibold uppercase ${gapStyle[p.status] ?? ""}`}>{p.status}</span>
                <span>{p.demand}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft && (
        <div className="space-y-2">
          {lintWarning && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Review flagged wording before sending: {lintWarning}
            </p>
          )}
          <LetterDraftArea value={draft} onChange={setDraft} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={save}><Save className="h-4 w-4" /> Save draft</Button>
            <Button size="sm" variant="outline" onClick={printLetter}><Printer className="h-4 w-4" /> Print / PDF</Button>
          </div>
          {savedMsg && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> {savedMsg}</p>}
        </div>
      )}
    </div>
  );
}

function EscalatePanel({
  complaintId,
  caseNumber,
  aiConfigured,
  onEscalated,
}: {
  complaintId: string;
  caseNumber: string | null;
  aiConfigured: boolean;
  onEscalated: () => void;
}) {
  const [generating, setGenerating] = React.useState<ComplaintDraftKind | null>(null);
  const [kind, setKind] = React.useState<ComplaintDraftKind | null>(null);
  const [draft, setDraft] = React.useState("");
  const [lintWarning, setLintWarning] = React.useState<string | null>(null);
  const [toLevel, setToLevel] = React.useState("EE");
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);

  async function gen(k: ComplaintDraftKind, level: string) {
    setGenerating(k);
    setError(null);
    setSavedMsg(null);
    setLintWarning(null);
    const r = await generateComplaintDraft({ complaintId, kind: k });
    setGenerating(null);
    if (!r.ok || !r.text) {
      setError(r.error ?? "Could not generate the draft (is the AI key configured?).");
      return;
    }
    setKind(k);
    setDraft(r.text);
    setToLevel(level);
    setLintWarning(r.lintWarning ?? null);
  }

  async function save() {
    if (!kind || !draft.trim()) return;
    setError(null);
    const r = await saveComplaintAiDraft({ complaintId, kind, title: COMPLAINT_DRAFT_KINDS[kind], content: draft });
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    setSavedMsg("Draft saved to the case (AI drafts).");
  }

  async function recordEscalation() {
    if (!kind) return;
    setError(null);
    const fd = new FormData();
    fd.set("toLevel", toLevel);
    fd.set("reason", `${COMPLAINT_DRAFT_KINDS[kind]} prepared${caseNumber ? ` for ${caseNumber}` : ""}.`);
    const r = await addComplaintEscalation(complaintId, {}, fd);
    if (r.error) { setError(r.error); return; }
    setSavedMsg(`Escalation to ${toLevel} recorded.`);
    onEscalated();
  }

  return (
    <StepPanel
      title="Draft an escalation from the case timeline"
      hint="Builds a cautious letter from the full chronology, prior replies and the linked forensic audit findings. Documented suspicions requiring records — never accusations."
    >
      {!aiConfigured && (
        <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" /> AI is not configured — set ANTHROPIC_API_KEY to generate escalation drafts.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {ESCALATION_OPTIONS.map((o) => (
          <Button key={o.kind} size="sm" variant="outline" disabled={!aiConfigured || generating !== null} onClick={() => gen(o.kind, o.toLevel)}>
            {generating === o.kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
            {COMPLAINT_DRAFT_KINDS[o.kind]}
          </Button>
        ))}
      </div>

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {draft && (
        <div className="space-y-2">
          {lintWarning && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Review flagged wording before sending: {lintWarning}
            </p>
          )}
          <LetterDraftArea value={draft} onChange={setDraft} />
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" variant="outline" onClick={save}><Save className="h-4 w-4" /> Save draft</Button>
            <Button size="sm" variant="outline" onClick={printLetter}><Printer className="h-4 w-4" /> Print / PDF</Button>
            <div className="space-y-1">
              <Label className="text-xs">Record escalation to</Label>
              <div className="flex gap-2">
                <select className={selectCls} value={toLevel} onChange={(e) => setToLevel(e.target.value)}>
                  {["AEE", "EE", "SE", "CE", "Commissioner", "Lokayukta", "Chief Secretary", "ACB", "Legal"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
                <Button size="sm" onClick={recordEscalation}><Gavel className="h-4 w-4" /> Record</Button>
              </div>
            </div>
          </div>
          {savedMsg && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> {savedMsg}</p>}
        </div>
      )}
    </StepPanel>
  );
}
