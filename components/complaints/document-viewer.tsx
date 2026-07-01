"use client";

import * as React from "react";
import { Loader2, ExternalLink, Download, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDocumentViewUrl, getJobDocumentViewUrl } from "@/lib/actions/complaints";

export interface ViewerTarget {
  documentId: string;
  title?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  /** Extracted text shown when the file itself can't render inline (e.g. DOCX). */
  fallbackText?: string | null;
  /** Which table the id belongs to: complaint_documents (default) or job_documents. */
  source?: "complaint" | "job";
}

function kindOf(t: ViewerTarget): "pdf" | "image" | "other" {
  const name = (t.fileName || t.title || "").toLowerCase();
  const mime = (t.mimeType || "").toLowerCase();
  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(name)) return "image";
  return "other";
}

/**
 * In-app document viewer. Renders PDFs (iframe) and images (img) inline so the
 * user never has to download to read a letter/reply/scan; DOCX and other types
 * fall back to their extracted text plus an open/download button. `target` being
 * non-null opens the dialog.
 */
export function DocumentViewer({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!target) { setUrl(null); setError(null); return; }
    // Text-only target (letter draft with no stored file) — nothing to fetch;
    // the fallbackText renders directly.
    if (!target.documentId) { setUrl(null); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    setUrl(null);
    const fetchUrl = target.source === "job"
      ? getJobDocumentViewUrl(target.documentId)
      : getDocumentViewUrl(target.documentId, "original");
    fetchUrl.then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.url) setUrl(r.url);
      else setError(r.error ?? "Could not open this document.");
    });
    return () => { cancelled = true; };
  }, [target]);

  const kind = target ? kindOf(target) : "other";

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] w-[95vw] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{target?.title || target?.fileName || "Document"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[50vh]">
          {loading && (
            <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-destructive">
              <AlertTriangle className="h-6 w-6" />
              {error}
            </div>
          )}

          {!loading && url && kind === "pdf" && (
            <iframe src={url} title="PDF preview" className="h-[75vh] w-full border-0" />
          )}

          {!loading && url && kind === "image" && (
            <div className="max-h-[75vh] overflow-auto bg-muted/30 p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={target?.title || "Document"} className="mx-auto max-w-full" />
            </div>
          )}

          {!loading && (kind === "other" || (!url && !error)) && (
            <div className="space-y-3 p-4">
              {target?.fallbackText ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    This file type can&apos;t preview inline — showing the extracted text. Use the buttons below to open or download the original.
                  </p>
                  <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border bg-muted/30 p-3 text-xs leading-relaxed">
                    {target.fallbackText}
                  </pre>
                </>
              ) : (
                <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" /> No inline preview for this file type — open or download it below.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-4 py-3">
          {url && (
            <>
              <Button asChild size="sm" variant="outline">
                <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Open in new tab</a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={url} download={target?.fileName || undefined}><Download className="h-4 w-4" /> Download</a>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
