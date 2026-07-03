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
  UploadCloud,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function DocTypeBadge({ type }: { type: string }) {
  if (type === "Application") {
    return (
      <Badge variant="info" className="text-[10px] px-2 py-0.5 font-bold shadow-3xs" dot>
        {type}
      </Badge>
    );
  }
  if (type === "Acknowledgement") {
    return (
      <Badge
        variant="outline"
        className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-950/30 dark:text-purple-400 text-[10px] px-2 py-0.5 font-bold shadow-3xs"
        dot
      >
        {type}
      </Badge>
    );
  }
  if (type === "Reply") {
    return (
      <Badge variant="success" className="text-[10px] px-2 py-0.5 font-bold shadow-3xs" dot>
        {type}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-bold shadow-3xs" dot>
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
  const [showSummary, setShowSummary] = React.useState(false);
  const ex = doc.ai_extracted ?? null;
  const ocrProcessing = doc.ocr_status === "Processing" || doc.ocr_status === "Pending";
  const aiProcessing = doc.ai_status === "Processing" || doc.ai_status === "Pending";

  return (
    <div className="rounded-xl border border-border/40 p-5 bg-card shadow-3xs space-y-3.5 animate-page-slide">
      {/* Upper row: Title, Type badge, and status indicators */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
            <FileText className="h-4.5 w-4.5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <DocTypeBadge type={doc.doc_type} />
              <span className="text-sm font-bold text-foreground leading-none">{doc.title || "Untitled document"}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
              Version v1.0 · {doc.page_count} page{doc.page_count > 1 ? "s" : ""}
              {doc.doc_date ? ` · dated ${fmtDate(doc.doc_date)}` : ""}
              {doc.uploader_name ? ` · by ${doc.uploader_name}` : ""}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant={statusVariant(doc.ocr_status)}
            className="text-[10px] px-2 py-0.5 font-bold shadow-3xs"
            dot={ocrProcessing}
          >
            OCR: {doc.ocr_status}
          </Badge>
          <Badge
            variant={statusVariant(doc.ai_status)}
            className="text-[10px] px-2 py-0.5 font-bold shadow-3xs"
            dot={aiProcessing}
          >
            AI: {doc.ai_status}
          </Badge>
        </div>
      </div>

      {/* Dynamic Summary Accordion */}
      {doc.ai_summary && (
        <div className="border-t border-border/10 pt-2.5 space-y-1.5">
          <button
            type="button"
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase hover:text-foreground transition-colors"
          >
            {showSummary ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            AI Document Analysis
          </button>
          {showSummary && (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground/95 leading-relaxed font-medium pl-4 border-l border-primary/20">
              {doc.ai_summary}
            </p>
          )}
        </div>
      )}

      {/* Key Extracted Info */}
      {ex && (ex.authority || ex.subject || ex.referenceNumber || ex.documentDate) && (
        <div className="border-t border-border/10 pt-2.5 grid gap-3 sm:grid-cols-2 text-xs">
          {ex.authority && (
            <div className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase">Extracted Authority</span>
              <span className="font-bold text-foreground block">{ex.authority}</span>
            </div>
          )}
          {ex.subject && (
            <div className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase">Extracted Subject</span>
              <span className="font-bold text-foreground block line-clamp-2">{ex.subject}</span>
            </div>
          )}
          {ex.referenceNumber && (
            <div className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase">Reference Code</span>
              <span className="font-bold text-foreground block font-mono">{ex.referenceNumber}</span>
            </div>
          )}
          {ex.documentDate && (
            <div className="space-y-0.5">
              <span className="text-[10px] text-muted-foreground/60 font-semibold uppercase">Document Date</span>
              <span className="font-bold text-foreground block">{fmtDate(ex.documentDate)}</span>
            </div>
          )}
        </div>
      )}

      {/* Row action tools */}
      <div className="border-t border-border/10 pt-2.5 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onView(doc.pdf_path)} className="font-semibold text-xs bg-white dark:bg-slate-900 border-border/60">
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Document
        </Button>
        {canEdit && (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReprocess(doc.id)} className="font-semibold text-xs bg-white dark:bg-slate-900 border-border/60">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Re-run Sync
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-destructive font-semibold text-xs" disabled={pending} onClick={() => onDelete(doc.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/20">
        <CardTitle className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted-foreground/80">
          <FileText className="h-4.5 w-4.5 text-primary" /> Case Documents
          <span className="text-xs font-normal text-muted-foreground">({documents.length})</span>
        </CardTitle>
        {canEdit ? (
          !adding && (
            <Button type="button" size="sm" onClick={() => setAdding(true)} className="font-semibold text-xs">
              <Plus className="h-4 w-4 mr-1" /> Add Document
            </Button>
          )
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> View-only
          </span>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {adding && (
          <div className="rounded-xl border bg-muted/5 p-4 animate-page-slide">
            <DocumentCapture
              rtiId={rtiId}
              existingTypes={documents.map((d) => d.doc_type)}
              onDone={() => setAdding(false)}
            />
          </div>
        )}

        {documents.length === 0 && !adding ? (
          <div className="border border-dashed border-border/60 rounded-xl p-8 text-center space-y-4 bg-muted/5 animate-page-slide">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div className="space-y-1.5 max-w-sm mx-auto">
              <h4 className="text-sm font-bold text-foreground">No case documents uploaded</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Scan or capture photos of the filed RTI, acknowledgements, or responses. They are automatically merged, OCR-indexed, and summarized.
              </p>
            </div>
            <div className="text-[10px] text-muted-foreground/60 font-semibold">
              Supported formats: PDF, PNG, JPG (Auto-PDF compilation)
            </div>
            {canEdit && (
              <Button type="button" size="sm" onClick={() => setAdding(true)} className="font-semibold text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Upload Case Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
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
