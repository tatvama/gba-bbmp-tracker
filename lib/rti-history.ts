import "server-only";
import type { AuditLog, RtiApplication, RtiDocument } from "@/lib/types";

/**
 * Unified activity-timeline event for an RTI. Built by merging three sources:
 *  - the RTI row itself (the "created" event),
 *  - rti_documents (rich upload events: title, page count, uploader, PDF path),
 *  - audit_logs (status changes, filing-date changes, and any other field edits).
 *
 * The thin `document_uploaded` / `document_deleted` audit rows are intentionally
 * skipped where the documents table already provides a richer event, so nothing
 * is shown twice.
 */
export type RtiHistoryType =
  | "created"
  | "status_changed"
  | "document_uploaded"
  | "reply_uploaded"
  | "ack_uploaded"
  | "date_filed"
  | "document_deleted"
  | "changed";

export interface RtiHistoryEvent {
  id: string;
  type: RtiHistoryType;
  createdAt: string;
  performedBy?: string | null;
  /** Display filename, e.g. "Application.pdf" (documents only). */
  documentName?: string | null;
  /** Human title entered for the document (documents only, optional). */
  documentTitle?: string | null;
  pageCount?: number | null;
  /** Raw document type — drives the badge ("Reply", "FAA Order", …). */
  docType?: string | null;
  /** Storage path for the merged PDF; powers the "View document" button. */
  pdfPath?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  /** Human label for a generic field change. */
  fieldLabel?: string | null;
}

/** Friendly labels for generic audit fields surfaced as "changed" events. */
const FIELD_LABELS: Record<string, string> = {
  reply_date: "Reply date",
  reply_summary: "Reply summary",
  satisfaction_status: "Satisfaction",
  public_authority: "Public authority",
  department: "Department",
  pio_name: "PIO",
  faa_name: "First Appellate Authority",
  subject: "Subject",
  category: "Category",
  priority: "Priority",
  date_received: "Date received",
};

function humanizeField(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function docTypeToEventType(docType: string): RtiHistoryType {
  if (docType === "Acknowledgement") return "ack_uploaded";
  if (docType === "Reply") return "reply_uploaded";
  return "document_uploaded";
}

function documentFileName(docType: string): string {
  return `${docType.replace(/\s+/g, "_")}.pdf`;
}

/** Audit field names that another source already represents (skip to avoid dupes). */
const SKIP_AUDIT_FIELDS = new Set([
  "created", // synthesized from rti.created_at
  "document_uploaded", // covered by rti_documents
  "deleted", // soft-delete of the whole RTI — not part of its own history view
]);

export function buildRtiHistory(
  rti: Pick<RtiApplication, "id" | "subject" | "created_at">,
  documents: RtiDocument[],
  audit: AuditLog[],
): RtiHistoryEvent[] {
  const events: RtiHistoryEvent[] = [];

  // 1. Creation
  events.push({
    id: `created-${rti.id}`,
    type: "created",
    createdAt: rti.created_at,
    newValue: rti.subject,
  });

  // 2. Documents (rich source)
  for (const d of documents) {
    events.push({
      id: `doc-${d.id}`,
      type: docTypeToEventType(d.doc_type),
      createdAt: d.created_at,
      performedBy: d.uploader_name,
      documentName: documentFileName(d.doc_type),
      documentTitle: d.title,
      pageCount: d.page_count,
      docType: d.doc_type,
      pdfPath: d.pdf_path,
    });
  }

  // 3. Audit-derived events
  for (const a of audit) {
    const field = a.field_name ?? "";
    if (SKIP_AUDIT_FIELDS.has(field) || field.startsWith("ack_")) continue;

    if (field === "status") {
      events.push({
        id: a.id,
        type: "status_changed",
        createdAt: a.changed_at,
        oldValue: a.old_value,
        newValue: a.new_value,
      });
    } else if (field === "date_filed") {
      events.push({
        id: a.id,
        type: "date_filed",
        createdAt: a.changed_at,
        oldValue: a.old_value,
        newValue: a.new_value,
      });
    } else if (field === "document_deleted") {
      events.push({
        id: a.id,
        type: "document_deleted",
        createdAt: a.changed_at,
        oldValue: a.old_value,
      });
    } else {
      events.push({
        id: a.id,
        type: "changed",
        createdAt: a.changed_at,
        oldValue: a.old_value,
        newValue: a.new_value,
        fieldLabel: FIELD_LABELS[field] ?? humanizeField(field),
      });
    }
  }

  // Chronological — oldest first (creation at the top of the timeline).
  events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return events;
}
