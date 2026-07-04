import type { ComplaintDocument, ComplaintTimelineEntry } from "@/lib/types";
import type { TimelineEventType } from "@/lib/constants";

export type ComplaintHistoryType = TimelineEventType;

export interface ComplaintHistoryEvent {
  id: string;
  type: ComplaintHistoryType;
  createdAt: string;
  title: string;
  summary?: string | null;
  /** "Note"/"Escalation" entries that are AI-drafted correspondence (saved draft, filed counter-reply) rather than a manually logged note — styled distinctly. */
  isAiCorrespondence: boolean;
  documentId?: string | null;
  documentName?: string | null;
  docType?: string | null;
  pageCount?: number | null;
}

const AI_TITLE_MARKERS = ["ai draft saved", "counter-reply filed"];

function looksLikeAiCorrespondence(title: string): boolean {
  const t = title.toLowerCase();
  return AI_TITLE_MARKERS.some((m) => t.includes(m));
}

/**
 * Merge complaint_timeline rows with their linked complaint_documents so
 * uploads/filed letters carry a "View PDF" attachment in the timeline —
 * the raw rows already have human-written title/summary text, so unlike
 * RTI's audit-log-derived history no description synthesis is needed here.
 */
export function buildComplaintHistory(
  timeline: ComplaintTimelineEntry[],
  documents: ComplaintDocument[],
): ComplaintHistoryEvent[] {
  const docsById = new Map(documents.map((d) => [d.id, d]));

  const events: ComplaintHistoryEvent[] = timeline.map((t) => {
    const doc = t.related_document_id ? docsById.get(t.related_document_id) : undefined;
    const title = t.title || t.event_type;
    return {
      id: t.id,
      type: (t.event_type as ComplaintHistoryType) || "Note",
      createdAt: t.event_date || t.created_at,
      title,
      summary: t.summary,
      isAiCorrespondence: looksLikeAiCorrespondence(title),
      documentId: doc?.id ?? null,
      documentName: doc?.original_file_name ?? null,
      docType: doc?.document_type ?? null,
      pageCount: doc?.page_count ?? null,
    };
  });

  events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return events;
}
