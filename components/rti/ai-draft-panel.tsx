"use client";

import * as React from "react";
import {
  Sparkles,
  Copy,
  Save,
  Loader2,
  AlertTriangle,
  Check,
  FileCheck,
  FileDown,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LetterPreview } from "@/components/complaints/letter-preview";
import { LetterEditorModal } from "@/components/complaints/letter-editor-modal";
import { transformDraft, saveAiDraft, type AiResult } from "@/lib/actions/ai";
import { formatDateTime } from "@/lib/format";

function humanizeKind(kind: string): string {
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TRANSFORMS: { label: string; instruction: string }[] = [
  { label: "Make stronger", instruction: "Make the tone stronger and more assertive while staying factual and respectful." },
  { label: "Make polite", instruction: "Soften the tone to be more polite and conciliatory while keeping all requests." },
  { label: "Convert to Kannada", instruction: "Translate the entire draft into formal Kannada (ಕನ್ನಡ)." },
  { label: "Make bilingual", instruction: "Provide the draft in English, then a formal Kannada (ಕನ್ನಡ) translation below, separated by a line of dashes." },
  { label: "Shorten", instruction: "Shorten the draft while keeping every information request and legal point." },
  { label: "Add legal points", instruction: "Add relevant RTI Act 2005 section references and legal points to strengthen the draft." },
  { label: "Add chronology", instruction: "Add a clear dated chronology of events near the top, using [PLACEHOLDER] for any missing dates." },
];

export function AiDraftPanel({
  aiConfigured,
  generate,
  entityType,
  entityId,
  kind,
  title,
  language,
  inputs,
  onApprove,
  approveLabel = "Approve & Create Case",
}: {
  aiConfigured: boolean;
  /** Caller binds the entity context; returns an editable draft (never filed). */
  generate: () => Promise<AiResult>;
  entityType?: string;
  entityId?: string;
  kind: string;
  /** Editor modal heading; defaults to a humanized `kind` (e.g. "First Appeal"). */
  title?: string;
  language?: string;
  /** Left-column summary of what will be sent to the model. */
  inputs?: React.ReactNode;
  /** When set, shows an "Approve & Create Case" button that receives the final
   *  edited text. Returns the created entity id (or an error). */
  onApprove?: (finalText: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
  approveLabel?: string;
}) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [truncated, setTruncated] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [downloadingPdf, setDownloadingPdf] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);

  async function onApproveClick() {
    if (!onApprove || !draft.trim()) return;
    setApproving(true);
    setError(null);
    try {
      const r = await onApprove(draft);
      if (!r.ok) setError(r.error ?? "Could not create the case.");
    } finally {
      setApproving(false);
    }
  }

  async function run(fn: () => Promise<AiResult>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    setTruncated(false);
    setSavedAt(null);
    try {
      const r = await fn();
      if (r.ok && r.text) {
        setDraft(r.text);
        setTruncated(!!r.truncated);
        setEditorOpen(true);
        // Auto-save the as-generated version immediately so it's never lost.
        const sr = await saveAiDraft({ entityType, entityId, kind, content: r.text, language });
        if (sr.ok) setSavedAt(formatDateTime(new Date().toISOString()));
      } else setError(r.error ?? "AI request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!draft.trim()) return;
    setSaving(true);
    const r = await saveAiDraft({ entityType, entityId, kind, content: draft, language });
    setSaving(false);
    if (r.ok) {
      setSaved(true);
      setSavedAt(formatDateTime(new Date().toISOString()));
      setTimeout(() => setSaved(false), 2500);
    } else setError(r.error ?? "Could not save draft.");
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function onDownloadPdf() {
    if (!draft.trim()) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      // Determine a friendly title based on document kind
      let docTitle = "Government Document Draft";
      if (kind === "rti") docTitle = "RTI Application Draft";
      else if (kind === "first_appeal") docTitle = "First Appeal Draft";
      else if (kind === "second_appeal") docTitle = "Second Appeal Draft";

      const res = await fetch("/api/pdf/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle,
          text: draft,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to download PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}_draft.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]">
      {/* Left: inputs + generate */}
      <div className="space-y-3">
        {inputs}
        {aiConfigured ? (
          <Button onClick={() => run(generate)} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {draft ? "Regenerate" : "Generate draft"}
          </Button>
        ) : (
          <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
            <AlertTriangle className="mb-1 h-4 w-4" />
            <span className="font-semibold">AI not configured.</span> Set{" "}
            <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> to enable
            drafting. You can still write and save a draft manually below.
          </div>
        )}
      </div>

      {/* Right: editable draft + actions */}
      <div className="space-y-2">
        <div className="rounded-md border border-amber/50 bg-amber/5 px-3 py-1.5 text-xs font-medium text-amber-dark">
          ⚠ Review before filing — AI drafts are starting points only and are never
          filed automatically.
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {truncated && (
          <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> This draft hit the AI&apos;s length limit and may be cut off mid-sentence — check the ending and regenerate if incomplete.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50/50 p-4 dark:bg-slate-900/10">
          <Button size="sm" onClick={() => setEditorOpen(true)}>
            <FileCheck className="h-4 w-4" /> Open Draft Workspace
          </Button>
          {draft ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {downloadingPdf ? "Generating PDF…" : "Download PDF"}
              </Button>
              {onApprove && (
                <Button
                  size="sm"
                  onClick={onApproveClick}
                  disabled={approving}
                >
                  {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                  {approving ? "Creating…" : approveLabel}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              No draft generated yet. Click generate on the left or open workspace to write manually.
            </span>
          )}
        </div>
        {savedAt && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> Saved {savedAt}</p>}
      </div>

      <LetterEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={title ?? humanizeKind(kind)}
        value={draft}
        onChange={setDraft}
        onSave={onSave}
        saving={saving}
        savedAt={savedAt}
      />
    </div>
  );
}
