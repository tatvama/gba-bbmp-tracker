"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentCapture } from "@/components/rti/document-capture";
import type { RtiDocument } from "@/lib/types";
import {
  getSignedUrlAction,
  reprocessRtiDocumentAction,
  deleteRtiDocumentAction,
} from "@/lib/actions/rti";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "Completed":
      return "success";
    case "Failed":
      return "destructive";
    case "Processing":
    case "Pending":
      return "warning";
    default:
      return "secondary";
  }
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function DocTypeBadge({ type }: { type: string }) {
  if (type === "Application") {
    return (
      <Badge variant="info" className="text-[12px] px-3 py-1 font-semibold shadow-sm" dot>
        {type}
      </Badge>
    );
  }
  if (type === "Acknowledgement") {
    return (
      <Badge
        variant="outline"
        className="border-purple-250 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-950/30 dark:text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)] dark:shadow-[0_0_15px_rgba(168,85,247,0.15)] text-[12px] px-3 py-1 font-semibold"
        dot
      >
        {type}
      </Badge>
    );
  }
  if (type === "Reply") {
    return (
      <Badge variant="success" className="text-[12px] px-3 py-1 font-semibold shadow-sm" dot>
        {type}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[12px] px-3 py-1 font-semibold shadow-sm" dot>
      {type}
    </Badge>
  );
}

function DocumentRow({
  doc,
  canEdit,
  onView,
  onReprocess,
  onDelete,
  pending,
}: {
  doc: RtiDocument;
  canEdit: boolean;
  onView: (path: string) => void;
  onReprocess: (id: string) => void;
  onDelete: (id: string) => void;
  pending: boolean;
}) {
  const ex = doc.ai_extracted ?? null;
  const ocrProcessing = doc.ocr_status === "Processing" || doc.ocr_status === "Pending";
  const aiProcessing = doc.ai_status === "Processing" || doc.ai_status === "Pending";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DocTypeBadge type={doc.doc_type} />
            <span className="text-sm font-medium">{doc.title || "Untitled document"}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {doc.page_count} page{doc.page_count > 1 ? "s" : ""}
            {doc.doc_date ? ` · dated ${fmtDate(doc.doc_date)}` : ""}
            {` · added ${fmtDate(doc.created_at)}`}
            {doc.uploader_name ? ` by ${doc.uploader_name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={statusVariant(doc.ocr_status)}
            className="text-[12px] px-3 py-1 font-semibold shadow-sm"
            dot={ocrProcessing}
          >
            OCR: {doc.ocr_status}
          </Badge>
          <Badge
            variant={statusVariant(doc.ai_status)}
            className="text-[12px] px-3 py-1 font-semibold shadow-sm"
            dot={aiProcessing}
          >
            AI: {doc.ai_status}
          </Badge>
        </div>
      </div>

      {doc.ai_summary && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{doc.ai_summary}</p>
      )}

      {ex && (ex.authority || ex.subject || ex.referenceNumber || ex.documentDate) && (
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Authority" value={ex.authority} />
          <Field label="Subject" value={ex.subject} />
          <Field label="Reference no." value={ex.referenceNumber} />
          <Field label="Date on document" value={ex.documentDate ? fmtDate(ex.documentDate) : null} />
        </dl>
      )}


      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onView(doc.pdf_path)}>
          <ExternalLink className="h-3.5 w-3.5" /> View PDF
        </Button>
        {canEdit && (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReprocess(doc.id)}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run OCR &amp; AI
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => onDelete(doc.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function RtiDocumentsPanel({
  rtiId,
  documents,
  canEdit,
}: {
  rtiId: string;
  documents: RtiDocument[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  const view = React.useCallback(async (path: string) => {
    const url = await getSignedUrlAction(path);
    if (url) window.open(url, "_blank");
    else alert("Could not generate a viewing link for this document.");
  }, []);

  const reprocess = React.useCallback(
    (id: string) => {
      setPendingId(id);
      startTransition(async () => {
        const res = await reprocessRtiDocumentAction(id);
        setPendingId(null);
        if (res.error) alert(res.error);
        else router.refresh();
      });
    },
    [router],
  );

  const remove = React.useCallback(
    (id: string) => {
      if (!confirm("Delete this document and its stored PDF? This cannot be undone.")) return;
      setPendingId(id);
      startTransition(async () => {
        const res = await deleteRtiDocumentAction(id);
        setPendingId(null);
        if (res.error) alert(res.error);
        else router.refresh();
      });
    },
    [router],
  );

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5 text-primary" /> Documents
          <span className="text-sm font-normal text-muted-foreground">({documents.length})</span>
        </CardTitle>
        {canEdit ? (
          !adding && (
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add document
            </Button>
          )
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> View-only
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adding && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <DocumentCapture
              rtiId={rtiId}
              existingTypes={documents.map((d) => d.doc_type)}
              onDone={() => setAdding(false)}
            />
          </div>
        )}

        {documents.length === 0 && !adding ? (
          <EmptyState
            title="No documents yet"
            description="Scan a PDF or capture photos of the filed RTI and its acknowledgement. They are merged into one PDF, OCR'd, and summarised — and the reply countdown starts from the filing date."
          />
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                canEdit={canEdit}
                onView={view}
                onReprocess={reprocess}
                onDelete={remove}
                pending={pendingId === doc.id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
