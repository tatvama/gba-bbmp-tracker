"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Send, FileCheck2, MessageSquareReply, Gavel, Loader2, Save, ScrollText, AlertTriangle, Check, ChevronRight,
  FileText, Eye, Search, Printer, CircleCheck, RotateCcw, Pencil, Sparkles, FileSearch, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScanCapture } from "@/components/complaints/scan-capture";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { LetterPreview } from "@/components/complaints/letter-preview";
import { LetterEditorModal } from "@/components/complaints/letter-editor-modal";
import { LanguageChoiceButton } from "@/components/complaints/language-choice-button";
import { DocumentSummaryModal } from "@/components/complaints/document-summary-modal";
import { openDraftPdf } from "@/lib/print-letter";
import { formatDateTime } from "@/lib/format";
import {
  setComplaintStatus,
  fileComplaint,
  generateComplaintDraft,
  saveComplaintAiDraft,
  getLatestComplaintAiDraft,
  addComplaintEscalation,
  fileCounterReplyAction,
  fileEscalationAction,
  listComplaintReplyFilesAction,
  generateDocumentSummaryAction,
  getDocumentViewUrl,
  type ReplyFile,
} from "@/lib/actions/complaints";
import { markLetterPrintedAction, undoLetterPrintedAction } from "@/lib/actions/print-queue";
import { analyzeReplyGapAction } from "@/lib/actions/lifecycle";
import type { ReplyGap } from "@/lib/ai/reply-gap-analyzer";
import type { ComplaintDocument } from "@/lib/types";
import { COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind, type DraftLanguage } from "@/lib/constants";

export interface WorkflowLetter {
  letterId: string | null;
  text: string | null;
  docxDocId: string | null;
  pdfDocId: string | null;
  fileName: string | null;
  printStatus: "none" | "pending" | "printed";
  printedAt: string | null;
  printedByName: string | null;
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
  { key: "close", label: "Close", icon: CircleCheck },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/** Terminal statuses — the case is fully closed (Close step complete). */
function isClosedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "resolved" || s === "closed";
}

/**
 * Map a complaint status to how far the workflow has progressed (0-based
 * boundary — a step shows a green tick when this value is GREATER than the
 * step's index). Reply-received / ATR / resolved / closed count the Reply step
 * as complete (=3), distinct from merely Acknowledged (=2), so the Reply/report
 * step ticks once a reply is in. Escalated goes past the last step (=4).
 */
function stepFromStatus(status: string): number {
  const s = status.toLowerCase();
  if (s === "resolved" || s === "closed") return 5; // Close step complete (terminal)
  if (s === "escalated" || s.includes("rti")) return 4; // Escalate complete
  if (s.includes("reply") || s.includes("action taken") || s.includes("partially") || s.includes("reopen")) return 3; // Reply complete
  if (s === "acknowledged" || s.includes("review") || s.includes("assigned") || s.includes("site visit") || s.includes("work in progress")) return 2;
  if (s === "filed") return 1;
  return 0; // Draft / unknown
}

/**
 * Which step tab to open by default. A closed case opens the Close step; an
 * escalated case opens Escalate; otherwise we stay on the Reply step (its
 * counter-reply tools + recent files) rather than auto-jumping ahead.
 */
function activeIdxFor(status: string, reached: number): number {
  const s = status.toLowerCase();
  if (isClosedStatus(status)) return 4; // Close
  if (s === "escalated" || s.includes("rti")) return 3; // Escalate
  return Math.min(reached, 2);
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
  documents = [],
}: {
  complaintId: string;
  status: string;
  jobNumber: string | null;
  caseNumber: string | null;
  aiConfigured: boolean;
  letter?: WorkflowLetter | null;
  documents?: ComplaintDocument[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reached = stepFromStatus(status);
  // Honor a ?step= deep link (e.g. the AI advisor's "Draft escalation letter"
  // opens ?step=escalate) over the default step, as long as it's not locked.
  const stepParam = searchParams.get("step");
  const paramIdx = STEPS.findIndex((s) => s.key === stepParam);
  // Escalate (3) and Close (4) are lateral actions — reachable once filed.
  const paramLocked = paramIdx >= 3 ? reached < 1 : paramIdx > reached;
  const initialIdx = paramIdx >= 0 && !paramLocked ? paramIdx : activeIdxFor(status, reached);
  const [active, setActive] = React.useState<StepKey>(STEPS[initialIdx]!.key);
  const [busy, setBusy] = React.useState(false);
  // Bumped when a reply/report is uploaded so the counter-reply panel's
  // "recent reply files" list re-fetches (the upload happens in a sibling).
  const [replyFilesKey, setReplyFilesKey] = React.useState(0);
  // AI's read on the most recently uploaded reply/report — drives which of
  // "Reply Received" / "Action Taken Report Received" the confirm button
  // applies. null until an upload comes back with a confident classification.
  const [replySuggestion, setReplySuggestion] = React.useState<{ status: string; confidence?: string } | null>(null);

  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);
  const [summaryDoc, setSummaryDoc] = React.useState<ComplaintDocument | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!summaryDoc) return;
    const fresh = documents.find((d) => d.id === summaryDoc.id);
    if (fresh && fresh !== summaryDoc) setSummaryDoc(fresh);
  }, [documents, summaryDoc]);

  async function generateSummary(id: string, force: boolean) {
    setBusyId(id);
    await generateDocumentSummaryAction(id, complaintId, { force });
    setBusyId(null);
    router.refresh();
  }

  async function downloadDoc(d: ComplaintDocument) {
    const r = await getDocumentViewUrl(d.id, "original");
    if (r.url) window.open(r.url, "_blank");
  }

  // Auto-advance the active tab only when the case's status actually changes —
  // not on mount (which would clobber a ?step= deep link).
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setActive(STEPS[activeIdxFor(status, reached)]!.key);
  }, [reached, status]);

  async function mark(next: string) {
    setBusy(true);
    await setComplaintStatus(complaintId, next);
    setBusy(false);
    setReplySuggestion(null);
    router.refresh();
  }

  const ACK_DOC_TYPES = ["Complaint acknowledgement", "Postal receipt", "Email printout", "Portal screenshot"];
  const ackDocs = documents.filter((d) => ACK_DOC_TYPES.includes(d.document_type || ""));

  return (
    <Card className="no-print border border-slate-150 dark:border-slate-850 shadow-xs rounded-xl overflow-hidden mb-6">
      <CardContent className="p-6">
        {/* Progress Tracker (Timeline Style) */}
        <div className="mb-6 px-4 py-6 select-none bg-slate-50/45 dark:bg-slate-950/20 rounded-xl border border-slate-150 dark:border-slate-850">
          <div className="relative flex flex-col md:flex-row items-stretch md:items-start justify-between gap-6 md:gap-0">
            {/* Horizontal connection line for desktop */}
            <div className="absolute top-[18px] left-[10%] right-[10%] hidden md:block h-0.5 bg-slate-200 dark:bg-slate-800 z-0">
              <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${Math.min(100, (reached / (STEPS.length - 1)) * 100)}%` }}
              />
            </div>

            {/* Vertical connection line for mobile */}
            <div className="absolute left-[18px] top-[18px] bottom-[18px] block md:hidden w-0.5 bg-slate-200 dark:bg-slate-800 z-0">
              <div 
                className="w-full bg-primary transition-all duration-500" 
                style={{ height: `${Math.min(100, (reached / (STEPS.length - 1)) * 100)}%` }}
              />
            </div>
            
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < reached;
              const isActive = s.key === active;
              const locked = s.key === "escalate" || s.key === "close" ? reached < 1 : i > reached;

              return (
                <div key={s.key} className="relative z-10 flex flex-row md:flex-col items-center flex-1 w-full md:w-auto gap-4 md:gap-0 group">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setActive(s.key)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 relative focus:outline-none",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-md scale-110 ring-4 ring-primary/20"
                        : done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : locked
                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                        : "border-slate-300 bg-white text-slate-600 hover:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-350 cursor-pointer"
                    )}
                    title={locked ? "Locked" : `Go to ${s.label}`}
                  >
                    {done ? <Check className="h-4.5 w-4.5 stroke-[3.5]" /> : <Icon className="h-4 w-4" />}
                  </button>
                  <div className="md:mt-4 space-y-0.5 text-left md:text-center">
                    <p className={cn(
                      "text-xs font-black tracking-wide uppercase",
                      isActive ? "text-primary" : done ? "text-emerald-600" : "text-slate-500"
                    )}>
                      {s.label}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {isActive ? "Active" : done ? "Done" : locked ? "Locked" : "Pending"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active step panel */}
        {active === "submit" && (
          <SubmitPanel
            complaintId={complaintId}
            jobNumber={jobNumber}
            letter={letter ?? null}
            filed={reached >= 1}
            onFiled={() => router.refresh()}
            documents={documents}
            setViewTarget={setViewTarget}
            setSummaryDoc={setSummaryDoc}
            generateSummary={generateSummary}
            busyId={busyId}
          />
        )}

        {active === "acknowledge" && (
          <StepPanel title="Upload the acknowledgement" hint="Scan or photograph the officer's acknowledgement / “forwarded to the concerned officer” slip. It is OCR'd and AI-summarised.">
            <ScanCapture
              complaintId={complaintId}
              docTypes={["Complaint acknowledgement", "Postal receipt", "Email printout", "Portal screenshot"]}
              defaultDocType="Complaint acknowledgement"
            />
            {ackDocs.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">Uploaded Acknowledgements</p>
                <div className="space-y-3">
                  {ackDocs.map((doc) => {
                    const isBusy = busyId === doc.id;
                    return (
                      <div key={doc.id} className="rounded-xl border bg-muted/20 p-4 border-slate-200 dark:border-slate-800">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">{doc.title || doc.original_file_name || "Acknowledgement Document"}</span>
                            <Badge variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-900 font-bold">{doc.document_type}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className="text-[10px] font-bold">OCR: {doc.ocr_status}</Badge>
                            <Badge className="text-[10px] font-bold">{doc.verification_status}</Badge>
                          </div>
                        </div>
                        {doc.ai_summary && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-semibold mb-3">{doc.ai_summary}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer" onClick={() => setViewTarget({ documentId: doc.id, title: doc.title || doc.original_file_name, mimeType: doc.mime_type, fileName: doc.original_file_name, fallbackText: doc.ocr_clean_text || doc.ocr_raw_text })}>
                            <Eye className="h-3.5 w-3.5" /> View document
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer" onClick={() => downloadDoc(doc)}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                          {doc.ai_summary_status === "ready" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer" onClick={() => setSummaryDoc(doc)}>
                              <FileSearch className="h-3.5 w-3.5" /> View Summary
                            </Button>
                          )}
                          {doc.ai_summary_status === "generating" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1" disabled>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating Summary…
                            </Button>
                          )}
                          {doc.ai_summary_status === "failed" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer" onClick={() => generateSummary(doc.id, true)} disabled={isBusy}>
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry Summary
                            </Button>
                          )}
                          {doc.ai_summary_status === "none" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs font-bold gap-1 cursor-pointer" onClick={() => generateSummary(doc.id, false)} disabled={isBusy}>
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate Summary
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-3">
              <Button size="sm" variant="outline" disabled={busy || reached > 1 || status.toLowerCase() === "acknowledged"} onClick={() => mark("Acknowledged")}>
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
              onDone={() => setReplyFilesKey((k) => k + 1)}
              onUploaded={(info) => {
                setReplyFilesKey((k) => k + 1);
                const status = info.suggestedStatus;
                const isConfident = info.confidence === "High" || info.confidence === "Medium";
                if (isConfident && (status === "Reply Received" || status === "Action Taken Report Received")) {
                  setReplySuggestion({ status: "Reply Received", confidence: info.confidence });
                } else {
                  setReplySuggestion(null);
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {replySuggestion ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => mark("Reply Received")}>
                    <MessageSquareReply className="h-4 w-4" />
                    Confirm: mark reply received
                  </Button>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> AI read this as a reply
                  </span>
                </>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => mark("Reply Received")}>
                  <MessageSquareReply className="h-4 w-4" /> Mark reply received
                </Button>
              )}
            </div>

            <div className="mt-4 border-t pt-4">
              <CounterReplyPanel complaintId={complaintId} aiConfigured={aiConfigured} refreshKey={replyFilesKey} />
            </div>
          </StepPanel>
        )}

        {active === "escalate" && (
          <EscalatePanel complaintId={complaintId} caseNumber={caseNumber} aiConfigured={aiConfigured} onEscalated={() => router.refresh()} />
        )}

        {active === "close" && (
          <ClosePanel complaintId={complaintId} status={status} onChanged={() => router.refresh()} />
        )}
      </CardContent>
      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
      <DocumentSummaryModal doc={summaryDoc} onClose={() => setSummaryDoc(null)} />
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
  documents,
  setViewTarget,
  setSummaryDoc,
  generateSummary,
  busyId,
}: {
  complaintId: string;
  jobNumber: string | null;
  letter: WorkflowLetter | null;
  filed: boolean;
  onFiled: () => void;
  documents: ComplaintDocument[];
  setViewTarget: (t: ViewerTarget | null) => void;
  setSummaryDoc: (d: ComplaintDocument | null) => void;
  generateSummary: (id: string, force: boolean) => Promise<void>;
  busyId: string | null;
}) {
  const [submittedDate, setSubmittedDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [channel, setChannel] = React.useState<string>(SUBMIT_CHANNELS[0]);
  const [referenceNo, setReferenceNo] = React.useState("");
  const [filedTo, setFiledTo] = React.useState("");
  const [followUpDays, setFollowUpDays] = React.useState("30");
  const [busy, setBusy] = React.useState(false);
  const [printBusy, setPrintBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [printStatus, setPrintStatus] = React.useState(letter?.printStatus ?? "none");
  const [printedAt, setPrintedAt] = React.useState(letter?.printedAt ?? null);
  const [printedByName, setPrintedByName] = React.useState(letter?.printedByName ?? null);

  const hasLetter = Boolean(letter && (letter.text || letter.pdfDocId || letter.docxDocId));
  const letterDoc = documents.find((d) => d.id === letter?.pdfDocId || d.id === letter?.docxDocId);
  // Only bill_stop / forensic-imported letters go through the print queue
  // (letterId present + printStatus tracked); manually drafted letters skip
  // straight to submission — nothing to gate there.
  const isTracked = printStatus === "pending" || printStatus === "printed";
  const isPrinted = printStatus === "printed";

  async function markPrinted() {
    if (!letter?.letterId) return;
    setPrintBusy(true);
    setError(null);
    const r = await markLetterPrintedAction(letter.letterId);
    setPrintBusy(false);
    if (!r.success) { setError(r.error ?? "Could not record the print."); return; }
    setPrintStatus("printed");
    setPrintedAt(new Date().toISOString());
  }

  async function undoPrinted() {
    if (!letter?.letterId) return;
    setPrintBusy(true);
    setError(null);
    const r = await undoLetterPrintedAction(letter.letterId);
    setPrintBusy(false);
    if (!r.success) { setError(r.error ?? "Could not undo."); return; }
    setPrintStatus("pending");
    setPrintedAt(null);
    setPrintedByName(null);
  }

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

            {/* AI Document Summary buttons for the drafted letter */}
            {letterDoc && (
              <>
                {letterDoc.ai_summary_status === "ready" && (
                  <Button size="sm" variant="outline" onClick={() => setSummaryDoc(letterDoc)}>
                    <FileSearch className="h-4 w-4" /> View Summary
                  </Button>
                )}
                {letterDoc.ai_summary_status === "generating" && (
                  <Button size="sm" variant="outline" disabled>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating Summary…
                  </Button>
                )}
                {letterDoc.ai_summary_status === "failed" && (
                  <Button size="sm" variant="outline" onClick={() => generateSummary(letterDoc.id, true)} disabled={busyId === letterDoc.id}>
                    <RotateCcw className="h-4 w-4" /> Retry Summary
                  </Button>
                )}
                {letterDoc.ai_summary_status === "none" && (
                  <Button size="sm" variant="outline" onClick={() => generateSummary(letterDoc.id, false)} disabled={busyId === letterDoc.id}>
                    <Sparkles className="h-4 w-4" /> Generate Summary
                  </Button>
                )}
              </>
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

      {/* Print status — the cycle starts here for imported letters */}
      {!filed && isTracked && (
        <div className={`flex flex-wrap items-center gap-2.5 rounded-md border p-3 ${isPrinted ? "border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/20" : "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"}`}>
          <Printer className={`h-4 w-4 shrink-0 ${isPrinted ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`} />
          <div className="min-w-0 flex-1 text-xs">
            {isPrinted ? (
              <span className="font-medium text-blue-700 dark:text-blue-400">
                Printed {printedAt ? new Date(printedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}
                {printedByName ? ` by ${printedByName}` : ""}. Submit it below once it&apos;s handed over / posted.
              </span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Print pending — this letter is in the <Link href="/complaints/print-queue" className="underline">print queue</Link>.
              </span>
            )}
          </div>
          {isPrinted ? (
            <Button size="sm" variant="ghost" onClick={undoPrinted} disabled={printBusy}>
              {printBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Undo
            </Button>
          ) : (
            <Button size="sm" onClick={markPrinted} disabled={printBusy}>
              {printBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Mark as printed
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
          {isTracked && !isPrinted && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" /> Not printed yet — you can still record the submission if it went out another way (e.g. email/portal).
            </p>
          )}
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
    </StepPanel>
  );
}

/**
 * Reply step add-on: after the officer's reply/report is uploaded, analyse what
 * the reply left unaddressed and draft a counter-reply / cross-question letter
 * from it (reuses the counter_reply AI draft kind + the reply-gap analyser).
 */
function CounterReplyPanel({ complaintId, aiConfigured, refreshKey = 0 }: { complaintId: string; aiConfigured: boolean; refreshKey?: number }) {
  const router = useRouter();
  const [gap, setGap] = React.useState<ReplyGap | null>(null);
  const [analysing, setAnalysing] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [lintWarning, setLintWarning] = React.useState<string | null>(null);
  const [truncated, setTruncated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [filing, setFiling] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [replyFiles, setReplyFiles] = React.useState<ReplyFile[]>([]);
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);

  // Load existing draft if any on mount
  React.useEffect(() => {
    async function loadSavedDraft() {
      const res = await getLatestComplaintAiDraft(complaintId, "counter_reply");
      if (res.ok && res.draft) {
        setDraft(res.draft.content);
        setSavedAt(formatDateTime(res.draft.created_at));
      }
    }
    void loadSavedDraft();
  }, [complaintId]);

  const loadFiles = React.useCallback(async () => {
    const r = await listComplaintReplyFilesAction(complaintId);
    setReplyFiles(r.files);
  }, [complaintId]);

  // Re-fetch on mount, whenever a reply/report is uploaded in the sibling
  // ScanCapture (refreshKey bumps), and on a slow poll as a backstop so the
  // "recent reply files" list never goes stale while the panel is open.
  React.useEffect(() => { void loadFiles(); }, [loadFiles, refreshKey]);
  React.useEffect(() => {
    const id = setInterval(() => void loadFiles(), 5000);
    return () => clearInterval(id);
  }, [loadFiles]);

  async function analyse() {
    setAnalysing(true);
    setError(null);
    setSavedMsg(null);
    const r = await analyzeReplyGapAction({ complaintId });
    setAnalysing(false);
    if (!r.ok || !r.data) { setError(r.error ?? "Could not analyse the reply."); return; }
    setGap(r.data);
  }

  async function generate(language: DraftLanguage) {
    setGenerating(true);
    setError(null);
    setSavedMsg(null);
    setLintWarning(null);
    setTruncated(false);
    setSavedAt(null);
    const r = await generateComplaintDraft({ complaintId, kind: "counter_reply", language });
    setGenerating(false);
    if (!r.ok || !r.text) { setError(r.error ?? "Could not generate the counter-reply (is the AI key configured?)."); return; }
    setDraft(r.text);
    setLintWarning(r.lintWarning ?? null);
    setTruncated(!!r.truncated);
    setEditorOpen(true);
    // Auto-save the as-generated version immediately so it's never lost, without
    // the timeline note / advisor re-run a deliberate Save triggers below.
    void saveComplaintAiDraft({ complaintId, kind: "counter_reply", content: r.text, language, silent: true })
      .then((sr) => { if (sr.ok) setSavedAt(formatDateTime(new Date().toISOString())); });
  }

  async function save() {
    if (!draft.trim()) return;
    setSavingDraft(true);
    setError(null);
    const r = await saveComplaintAiDraft({ complaintId, kind: "counter_reply", title: COMPLAINT_DRAFT_KINDS.counter_reply, content: draft });
    setSavingDraft(false);
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    setSavedMsg("Counter-reply saved to the case (AI drafts).");
    setSavedAt(formatDateTime(new Date().toISOString()));
  }

  async function fileCounter() {
    if (!draft.trim()) return;
    setFiling(true);
    setError(null);
    setSavedMsg(null);
    const r = await fileCounterReplyAction(complaintId, draft);
    setFiling(false);
    if (!r.ok) { setError(r.error ?? "Could not file the counter-reply."); return; }
    setSavedMsg("Counter-reply filed as a PDF — it now sits with the department's reply below.");
    await loadFiles();
    router.refresh();
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
      <div className="flex flex-wrap gap-2">
        <LanguageChoiceButton
          size="sm"
          variant="outline"
          busy={generating}
          disabled={!aiConfigured}
          icon={MessageSquareReply}
          onChoose={generate}
        >
          Generate counter-reply
        </LanguageChoiceButton>
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
          {truncated && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> This letter hit the AI&apos;s length limit and may be cut off mid-sentence — check the ending and regenerate if incomplete.
            </p>
          )}
          {lintWarning && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Review flagged wording before sending: {lintWarning}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50/50 p-3.5 dark:bg-slate-900/10">
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              <FileCheck2 className="h-4 w-4" /> View / Edit Counter-reply Letter
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={fileCounter} disabled={filing}>
                {filing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} File counter-reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  setError(null);
                  const err = await openDraftPdf("Counter-reply", draft);
                  setPdfBusy(false);
                  if (err) setError(err);
                }}
              >
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print / PDF
              </Button>
            </div>
          </div>
          {savedMsg && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> {savedMsg}</p>}
          {savedAt && !savedMsg && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-600" /> Auto-saved {savedAt}</p>}
          <LetterEditorModal
            open={editorOpen}
            onOpenChange={setEditorOpen}
            title="Counter-Reply Letter"
            value={draft}
            onChange={setDraft}
            onSave={save}
            saving={savingDraft}
            savedAt={savedAt}
          />
        </div>
      )}

      {/* The two sides of the exchange as files: the department's reply(ies) and
          our filed counter-reply(ies), newest first. */}
      {replyFiles.length > 0 && (
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Recent reply files</p>
          <ul className="space-y-1.5">
            {replyFiles.slice(0, 2).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    f.direction === "out"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {f.direction === "out" ? "Sent" : "Received"}
                </span>
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{f.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7"
                  onClick={() => setViewTarget({ documentId: f.id, title: f.title, mimeType: f.mimeType, fileName: f.fileName })}
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
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
  const [truncated, setTruncated] = React.useState(false);
  const [toLevel, setToLevel] = React.useState("EE");
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);
  const [filing, setFiling] = React.useState(false);

  // Load existing escalation draft if any on mount
  React.useEffect(() => {
    async function loadSavedDraft() {
      const res = await getLatestComplaintAiDraft(complaintId, "escalation");
      if (res.ok && res.draft) {
        setDraft(res.draft.content);
        if (res.draft.kind) setKind(res.draft.kind as ComplaintDraftKind);
        setSavedAt(formatDateTime(res.draft.created_at));
      }
    }
    void loadSavedDraft();
  }, [complaintId]);

  async function fileEscalation() {
    if (!kind || !draft.trim()) return;
    setFiling(true);
    setError(null);
    setSavedMsg(null);
    const r = await fileEscalationAction(complaintId, draft, { kind, title: COMPLAINT_DRAFT_KINDS[kind] });
    setFiling(false);
    if (!r.ok) { setError(r.error ?? "Could not file the escalation."); return; }
    setSavedMsg("Escalation filed as a PDF — view it from the Correspondence tab.");
    onEscalated();
  }

  async function gen(k: ComplaintDraftKind, level: string, language: DraftLanguage) {
    setGenerating(k);
    setError(null);
    setSavedMsg(null);
    setLintWarning(null);
    setTruncated(false);
    setSavedAt(null);
    const r = await generateComplaintDraft({ complaintId, kind: k, language });
    setGenerating(null);
    if (!r.ok || !r.text) {
      setError(r.error ?? "Could not generate the draft (is the AI key configured?).");
      return;
    }
    setKind(k);
    setDraft(r.text);
    setToLevel(level);
    setLintWarning(r.lintWarning ?? null);
    setTruncated(!!r.truncated);
    setEditorOpen(true);
    // Auto-save the as-generated version immediately so it's never lost, without
    // the timeline note / advisor re-run a deliberate Save triggers below.
    void saveComplaintAiDraft({ complaintId, kind: k, content: r.text, language, silent: true })
      .then((sr) => { if (sr.ok) setSavedAt(formatDateTime(new Date().toISOString())); });
  }

  async function save() {
    if (!kind || !draft.trim()) return;
    setSavingDraft(true);
    setError(null);
    const r = await saveComplaintAiDraft({ complaintId, kind, title: COMPLAINT_DRAFT_KINDS[kind], content: draft });
    setSavingDraft(false);
    if (!r.ok) { setError(r.error ?? "Could not save."); return; }
    setSavedMsg("Draft saved to the case (AI drafts).");
    setSavedAt(formatDateTime(new Date().toISOString()));
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
          <LanguageChoiceButton
            key={o.kind}
            size="sm"
            variant="outline"
            busy={generating === o.kind}
            disabled={!aiConfigured || generating !== null}
            icon={Gavel}
            onChoose={(language) => gen(o.kind, o.toLevel, language)}
          >
            {COMPLAINT_DRAFT_KINDS[o.kind]}
          </LanguageChoiceButton>
        ))}
      </div>

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {draft && (
        <div className="space-y-2">
          {truncated && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> This letter hit the AI&apos;s length limit and may be cut off mid-sentence — check the ending and regenerate if incomplete.
            </p>
          )}
          {lintWarning && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Review flagged wording before sending: {lintWarning}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50/50 p-3.5 dark:bg-slate-900/10">
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              <FileCheck2 className="h-4 w-4" /> View / Edit Escalation Letter
            </Button>
            <div className="flex flex-wrap items-end gap-2">
              <Button size="sm" variant="outline" onClick={fileEscalation} disabled={filing}>
                {filing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} File escalation
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  setError(null);
                  const err = await openDraftPdf(kind ? COMPLAINT_DRAFT_KINDS[kind] : "Escalation letter", draft);
                  setPdfBusy(false);
                  if (err) setError(err);
                }}
              >
                {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print / PDF
              </Button>
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
          </div>
          {savedMsg && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> {savedMsg}</p>}
          {savedAt && !savedMsg && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-600" /> Auto-saved {savedAt}</p>}
          <LetterEditorModal
            open={editorOpen}
            onOpenChange={setEditorOpen}
            title={kind ? COMPLAINT_DRAFT_KINDS[kind] : "Escalation Letter"}
            value={draft}
            onChange={setDraft}
            onSave={save}
            saving={savingDraft}
            savedAt={savedAt}
          />
        </div>
      )}
    </StepPanel>
  );
}

/**
 * Close / resolve step — the terminal state of the case. Records the outcome
 * (which stamps closure_date + a Closure timeline entry via setComplaintStatus)
 * with an optional closing note, and offers a Reopen when the case is already
 * closed. This is what lets each complaint reach its complete final status.
 */
const CLOSE_OUTCOMES: { status: string; label: string; hint: string }[] = [
  { status: "Resolved", label: "Mark resolved", hint: "The issue was fixed / the records were produced." },
  { status: "Partially Resolved", label: "Partially resolved", hint: "Some of it was addressed; the rest is dropped or deferred." },
  { status: "Closed", label: "Close case", hint: "Shut the case with no further action (e.g. withdrawn, out of scope)." },
];

function ClosePanel({ complaintId, status, onChanged }: { complaintId: string; status: string; onChanged: () => void }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const closed = isClosedStatus(status);

  async function setOutcome(next: string) {
    setBusy(next);
    setError(null);
    const r = await setComplaintStatus(complaintId, next, note.trim() || undefined);
    setBusy(null);
    if (r.error) { setError(r.error); return; }
    onChanged();
  }

  return (
    <StepPanel
      title="Close or resolve this case"
      hint="Record the final outcome when the complaint is resolved, closed, or dead. This stamps the closure date and completes the case; you can reopen it later if needed."
    >
      <div className={`flex items-center gap-2 rounded-md border p-3 text-xs ${closed ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "border-slate-200 bg-muted/30 dark:border-slate-800"}`}>
        {closed ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <MessageSquareReply className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span>Current status: <span className="font-semibold">{status}</span>{closed ? " — this case is closed." : ""}</span>
      </div>

      {!closed && (
        <div className="space-y-1">
          <Label className="text-xs">Closing note (optional)</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Road re-laid and verified on site; contractor produced the MB copies."
            className="w-full rounded-md border border-input bg-background p-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {closed ? (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setOutcome("Reopened")}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reopen case
        </Button>
      ) : (
        <div className="space-y-2">
          {CLOSE_OUTCOMES.map((o) => (
            <div key={o.status} className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={o.status === "Closed" ? "outline" : "default"} disabled={busy !== null} onClick={() => setOutcome(o.status)}>
                {busy === o.status ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />} {o.label}
              </Button>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </div>
          ))}
        </div>
      )}
    </StepPanel>
  );
}
