"use client";

import * as React from "react";
import { ArrowUpRight, ArrowDownLeft, FileText, Gavel, Eye, ScrollText, MessageSquareReply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentViewer, type ViewerTarget } from "@/components/complaints/document-viewer";
import { COMPLAINT_DRAFT_KINDS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { ComplaintDocument, AiDraft } from "@/lib/types";

/** The complaint letter drafted by the forensic audit (from case-workflow). */
export interface ThreadLetter {
  text: string | null;
  fileName: string | null;
  pdfDocId: string | null;
  docxDocId: string | null;
}

type ThreadEntry = {
  id: string;
  date: string | null;
  dir: "out" | "in" | "note";
  kind: string;
  title: string;
  subtitle?: string | null;
  viewer?: ViewerTarget;
};

const isLetterDoc = (t: string | null | undefined) => !!t && /generated complaint letter/i.test(t);
const isAckDoc = (t: string | null | undefined) => !!t && /acknowledg|receipt|postal|inward/i.test(t);
const isReplyDoc = (t: string | null | undefined) => !!t && /reply|action taken|atr|report|inspection/i.test(t);

/**
 * Unified case correspondence: the whole cycle in one chronological thread —
 * the drafted complaint letter (out) → acknowledgement (in) → department reply
 * (in) → counter-reply / escalation drafts (out) → escalations (out). Every
 * entry with a stored file opens inline via the DocumentViewer.
 */
export function CaseThread({
  documents,
  escalations,
  aiDrafts,
}: {
  documents: ComplaintDocument[];
  escalations: Record<string, unknown>[];
  aiDrafts: AiDraft[];
}) {
  const [viewTarget, setViewTarget] = React.useState<ViewerTarget | null>(null);

  const entries: ThreadEntry[] = [];

  for (const d of documents) {
    const t = d.document_type;
    const target: ViewerTarget = {
      documentId: d.id,
      title: d.title || d.original_file_name,
      mimeType: d.mime_type,
      fileName: d.original_file_name,
      fallbackText: d.ocr_clean_text || d.ocr_raw_text,
    };
    if (isLetterDoc(t)) {
      entries.push({ id: d.id, date: d.uploaded_at, dir: "out", kind: "Complaint letter", title: d.title || "Drafted complaint letter", subtitle: d.document_type, viewer: target });
    } else if (isAckDoc(t)) {
      entries.push({ id: d.id, date: d.uploaded_at, dir: "in", kind: "Acknowledgement", title: d.title || d.document_type || "Acknowledgement", subtitle: d.ai_summary, viewer: target });
    } else if (isReplyDoc(t)) {
      entries.push({ id: d.id, date: d.uploaded_at, dir: "in", kind: "Reply / report", title: d.title || d.document_type || "Department reply", subtitle: d.ai_summary, viewer: target });
    } else {
      entries.push({ id: d.id, date: d.uploaded_at, dir: "note", kind: "Document", title: d.title || d.original_file_name || "Document", subtitle: d.document_type, viewer: target });
    }
  }

  for (const dr of aiDrafts) {
    const kindLabel = (COMPLAINT_DRAFT_KINDS as Record<string, string>)[dr.kind ?? ""] ?? dr.kind ?? "AI draft";
    entries.push({
      id: `draft-${dr.id}`,
      date: dr.created_at,
      dir: "out",
      kind: "Draft",
      title: kindLabel,
      subtitle: (dr.content ?? "").slice(0, 120),
      viewer: dr.content ? { documentId: "", title: kindLabel, fallbackText: dr.content } : undefined,
    });
  }

  for (const e of escalations) {
    entries.push({
      id: `esc-${String(e.id)}`,
      date: (e.escalated_on as string) ?? null,
      dir: "out",
      kind: "Escalation",
      title: `Escalated to ${(e.to_level as string) ?? "next authority"}${e.to_officer ? ` · ${e.to_officer}` : ""}`,
      subtitle: (e.reason as string) ?? null,
    });
  }

  // Oldest → newest, so the cycle reads as a story. Undated entries sort last.
  entries.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : Infinity;
    const tb = b.date ? Date.parse(b.date) : Infinity;
    return ta - tb;
  });

  if (entries.length === 0) {
    return <EmptyState icon={ScrollText} title="No correspondence yet" description="The drafted letter, replies, and escalation drafts will appear here as the case progresses." />;
  }

  return (
    <>
      <ol className="space-y-3">
        {entries.map((e) => {
          const out = e.dir === "out";
          const Icon = e.kind === "Escalation" ? Gavel : e.kind === "Draft" ? MessageSquareReply : e.kind === "Complaint letter" ? ScrollText : FileText;
          return (
            <li
              key={e.id}
              className={`rounded-lg border p-3 ${
                out
                  ? "border-l-4 border-l-primary/60 bg-primary/[0.03]"
                  : e.dir === "in"
                    ? "border-l-4 border-l-emerald-400/60 bg-emerald-50/30 dark:bg-emerald-950/10"
                    : "bg-card"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${out ? "text-primary" : e.dir === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {out ? <ArrowUpRight className="h-3.5 w-3.5" /> : e.dir === "in" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  {out ? "SENT" : e.dir === "in" ? "RECEIVED" : "FILE"}
                </span>
                <Badge variant="outline" className="gap-1"><Icon className="h-3 w-3" />{e.kind}</Badge>
                <span className="text-sm font-medium">{e.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{e.date ? formatDate(e.date) : "—"}</span>
              </div>
              {e.subtitle && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.subtitle}</p>}
              {e.viewer && (
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => setViewTarget(e.viewer!)}>
                    <Eye className="h-4 w-4" /> {e.kind === "Draft" ? "Read" : "View"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <DocumentViewer target={viewTarget} onClose={() => setViewTarget(null)} />
    </>
  );
}
