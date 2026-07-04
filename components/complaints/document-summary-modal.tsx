"use client";

import * as React from "react";
import { Copy, Printer, Download, Check, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import type { ComplaintDocument, ComplaintExtraction } from "@/lib/types";

/**
 * Read-only viewer for a document's STORED AI summary. Never calls the AI — it
 * only renders what was generated once and persisted (ai_summary +
 * ai_extracted_json). Regeneration is a separate, explicit action on the row.
 */
export function DocumentSummaryModal({
  doc,
  onClose,
}: {
  doc: ComplaintDocument | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const ex: ComplaintExtraction | null = doc?.ai_extracted_json ?? null;
  const summaryText = doc?.ai_summary || ex?.summary || "";

  const dates = React.useMemo(() => {
    if (!ex) return [] as string[];
    const out: string[] = [...(ex.importantDates ?? [])];
    if (ex.replyDate) out.push(`Reply date: ${ex.replyDate}`);
    if (ex.actionTakenDate) out.push(`Action taken: ${ex.actionTakenDate}`);
    if (ex.suggestedFollowUpDate) out.push(`Suggested follow-up: ${ex.suggestedFollowUpDate}`);
    return out.filter(Boolean);
  }, [ex]);

  const officers = React.useMemo(() => {
    if (!ex) return [] as string[];
    return [...(ex.officerNames ?? []), ...(ex.departmentNames ?? [])].filter(Boolean);
  }, [ex]);

  const actionItems = React.useMemo(() => {
    if (!ex) return [] as string[];
    return [ex.suggestedNextAction, ex.actionTaken, ex.recommendedEscalation ? `If unresolved: ${ex.recommendedEscalation}` : ""].filter(Boolean) as string[];
  }, [ex]);

  const highlights = React.useMemo(() => {
    if (!ex) return [] as string[];
    return [
      ex.replyGiven ? `Reply given: ${ex.replyGiven}` : "",
      ex.workDescription ? `Work described: ${ex.workDescription}` : "",
      ex.suggestedComplaintStatus ? `Suggested status: ${ex.suggestedComplaintStatus}` : "",
    ].filter(Boolean) as string[];
  }, [ex]);

  function buildPlainText(): string {
    if (!doc) return "";
    const lines: string[] = [];
    lines.push(`AI SUMMARY — ${doc.title || doc.original_file_name || "Document"}`);
    lines.push("=".repeat(48));
    lines.push(`Type: ${doc.document_type ?? "—"}`);
    lines.push(`Uploaded: ${formatDate(doc.uploaded_at)}`);
    if (doc.document_date) lines.push(`Document date: ${formatDate(doc.document_date)}`);
    if (doc.ai_confidence) lines.push(`AI confidence: ${doc.ai_confidence}`);
    if (doc.ai_summary_generated_at) lines.push(`Summary generated: ${formatDate(doc.ai_summary_generated_at)}`);
    lines.push("");
    if (summaryText) { lines.push("SUMMARY"); lines.push(summaryText); lines.push(""); }
    if (ex?.pendingIssues?.length) { lines.push("KEY POINTS"); ex.pendingIssues.forEach((p) => lines.push(`- ${p}`)); lines.push(""); }
    if (dates.length) { lines.push("IMPORTANT DATES"); dates.forEach((d) => lines.push(`- ${d}`)); lines.push(""); }
    if (officers.length) { lines.push("OFFICERS / DEPARTMENTS"); officers.forEach((o) => lines.push(`- ${o}`)); lines.push(""); }
    if (ex?.complaintNumber) { lines.push("REFERENCE NUMBERS"); lines.push(`- ${ex.complaintNumber}`); lines.push(""); }
    if (actionItems.length) { lines.push("ACTION ITEMS"); actionItems.forEach((a) => lines.push(`- ${a}`)); lines.push(""); }
    if (highlights.length) { lines.push("EXTRACTED HIGHLIGHTS"); highlights.forEach((h) => lines.push(`- ${h}`)); lines.push(""); }
    return lines.join("\n").trim();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — no-op */ }
  }

  function download() {
    if (!doc) return;
    const blob = new Blob([buildPlainText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (doc.title || doc.original_file_name || "document").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.download = `${base}-summary.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printSummary() {
    if (!doc) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const section = (title: string, items: string[]) =>
      items.length ? `<h2>${esc(title)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title || "Summary")}</title>
      <style>body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:32px auto;padding:0 24px;color:#111;line-height:1.5}
      h1{font-size:18pt;margin-bottom:2px}h2{font-size:12pt;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.04em;color:#333}
      .meta{color:#555;font-size:10pt;margin-bottom:12px}ul{margin:4px 0 0;padding-left:20px}p{margin:4px 0}</style></head>
      <body>
      <h1>AI Summary — ${esc(doc.title || doc.original_file_name || "Document")}</h1>
      <div class="meta">${esc(doc.document_type ?? "")} · Uploaded ${esc(formatDate(doc.uploaded_at))}${doc.ai_confidence ? ` · AI confidence ${esc(doc.ai_confidence)}` : ""}</div>
      ${summaryText ? `<h2>Summary</h2><p>${esc(summaryText)}</p>` : ""}
      ${section("Key points", ex?.pendingIssues ?? [])}
      ${section("Important dates", dates)}
      ${section("Officers / departments", officers)}
      ${section("Reference numbers", ex?.complaintNumber ? [ex.complaintNumber] : [])}
      ${section("Action items", actionItems)}
      ${section("Extracted highlights", highlights)}
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI Summary
          </DialogTitle>
        </DialogHeader>

        {doc && (
          <div className="space-y-4 text-sm">
            {/* Document Information */}
            <Section title="Document Information">
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <Field label="Title">{doc.title || doc.original_file_name || "—"}</Field>
                <Field label="Type">{doc.document_type ?? "—"}</Field>
                <Field label="Uploaded">{formatDate(doc.uploaded_at)}</Field>
                {doc.document_date && <Field label="Document date">{formatDate(doc.document_date)}</Field>}
                {doc.ai_summary_generated_at && <Field label="Summary generated">{formatDate(doc.ai_summary_generated_at)}</Field>}
                <Field label="Confidence">
                  {doc.ai_confidence ? <Badge variant="outline">AI {doc.ai_confidence}</Badge> : "—"}
                </Field>
              </div>
            </Section>

            {summaryText ? (
              <Section title="AI Summary">
                <p className="whitespace-pre-wrap text-foreground/90">{summaryText}</p>
              </Section>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-muted-foreground">
                <FileText className="h-4 w-4" /> No summary text was extracted for this document.
              </div>
            )}

            <BulletSection title="Key Points" items={ex?.pendingIssues ?? []} />
            <BulletSection title="Important Dates" items={dates} />
            <BulletSection title="Officers / Departments Mentioned" items={officers} />
            <BulletSection title="Reference Numbers" items={ex?.complaintNumber ? [ex.complaintNumber] : []} />
            <BulletSection title="Action Items" items={actionItems} />
            <BulletSection title="Extracted Highlights" items={highlights} />
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy Summary"}
          </Button>
          <Button variant="outline" size="sm" onClick={printSummary}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="h-4 w-4" /> Download Summary
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="sm:ml-auto">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  const clean = items.filter((s) => s && s.trim());
  if (!clean.length) return null;
  return (
    <Section title={title}>
      <ul className="list-disc space-y-1 pl-5 text-foreground/90">
        {clean.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</span>
      <span className="text-foreground/90">{children}</span>
    </div>
  );
}
