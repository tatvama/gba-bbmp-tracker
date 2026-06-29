"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send, FileCheck2, MessageSquareReply, Gavel, Loader2, Save, ScrollText, AlertTriangle, Check, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScanCapture } from "@/components/complaints/scan-capture";
import {
  setComplaintStatus,
  generateComplaintDraft,
  saveComplaintAiDraft,
  addComplaintEscalation,
} from "@/lib/actions/complaints";
import { COMPLAINT_DRAFT_KINDS, type ComplaintDraftKind } from "@/lib/constants";

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
}: {
  complaintId: string;
  status: string;
  jobNumber: string | null;
  caseNumber: string | null;
  aiConfigured: boolean;
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
          <StepPanel title="Draft &amp; submit to the concerned officer" hint="Draft the complaint/bill-stop letter, print it, submit it, then mark the case filed.">
            <div className="flex flex-wrap gap-2">
              {jobNumber ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/letter`}><ScrollText className="h-4 w-4" /> Draft bill-stop / complaint letter</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/complaints/${complaintId}#ai-drafts`}><ScrollText className="h-4 w-4" /> Draft a letter (AI drafts tab)</Link>
                </Button>
              )}
              <Button size="sm" disabled={busy || reached >= 1} onClick={() => mark("Filed")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {reached >= 1 ? "Filed" : "Mark as filed (submitted)"}
              </Button>
            </div>
          </StepPanel>
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
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
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
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" variant="outline" onClick={save}><Save className="h-4 w-4" /> Save draft</Button>
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
