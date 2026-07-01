"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, RefreshCw, Sparkles, ClipboardCheck, Loader2, FileText, CheckCircle2, ScanEye, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { DocumentReview } from "@/components/complaints/document-review";
import { getDocumentViewUrl, setDocumentVerification } from "@/lib/actions/complaints";
import { formatDate } from "@/lib/format";
import type { ComplaintDocument } from "@/lib/types";

const OCR_VARIANT: Record<string, BadgeProps["variant"]> = {
  Completed: "success", "Needs Manual Review": "warning", Processing: "secondary",
  Queued: "secondary", Failed: "destructive", Skipped: "muted", "Not Started": "muted",
};
const VERIF_VARIANT: Record<string, BadgeProps["variant"]> = {
  Verified: "success", "Pending Review": "muted", "Needs Correction": "warning",
  Rejected: "destructive", Duplicate: "destructive", "Low Confidence": "warning",
};
const VISION_VARIANT: Record<string, BadgeProps["variant"]> = {
  ok: "success", suspect: "warning", mismatch: "destructive", not_site_photo: "destructive",
};
const VISION_LABEL: Record<string, string> = {
  ok: "Photo OK", suspect: "Photo suspect", mismatch: "Photo mismatch", not_site_photo: "Not a site photo",
};

export function DocumentList({
  documents,
  complaintId,
  canVerify,
}: {
  documents: ComplaintDocument[];
  complaintId: string;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [reviewDoc, setReviewDoc] = React.useState<ComplaintDocument | null>(null);

  async function view(id: string) {
    setBusyId(id);
    const r = await getDocumentViewUrl(id);
    setBusyId(null);
    if (r.url) window.open(r.url, "_blank", "noopener");
    else alert(r.error ?? "Could not open document.");
  }

  async function post(url: string, id: string) {
    setBusyId(id);
    try {
      await fetch(url, { method: "POST" });
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  async function verify(id: string, status: string) {
    setBusyId(id);
    await setDocumentVerification(id, complaintId, status);
    setBusyId(null);
    router.refresh();
  }

  if (documents.length === 0) {
    return <EmptyState icon={FileText} title="No documents yet" description="Upload complaint papers, replies, ATRs, or site photos above." />;
  }

  return (
    <>
      <ul className="space-y-3">
        {documents.map((d, idx) => {
          const busy = busyId === d.id;
          const staggerClass = `stagger-${(idx % 4) + 1}`;
          return (
            <li
              key={d.id}
              className={cn(
                "rounded-lg border p-3 bg-card transition-all duration-300 ease-in-out hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-700 animate-fade-in",
                staggerClass
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{d.title || d.original_file_name || "Document"}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.document_type ?? "—"} · {formatDate(d.uploaded_at)}
                    {d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} KB` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={OCR_VARIANT[d.ocr_status] ?? "muted"}>OCR: {d.ocr_status}</Badge>
                  <Badge variant={VERIF_VARIANT[d.verification_status] ?? "muted"}>{d.verification_status}</Badge>
                  {d.is_duplicate && (
                    <Link href="/complaints/duplicates" title="Same image found on another job/case">
                      <Badge variant="destructive">⚠ Duplicate{d.dup_severity ? ` · ${d.dup_severity}` : ""}</Badge>
                    </Link>
                  )}
                  {d.vision_verdict && (
                    <Badge variant={VISION_VARIANT[d.vision_verdict] ?? "muted"}>
                      {VISION_LABEL[d.vision_verdict] ?? d.vision_verdict}
                    </Badge>
                  )}
                  {d.geo_flag === "far" && (
                    <Badge variant="destructive" title={d.geo_distance_m ? `${Math.round(d.geo_distance_m)} m from the reported location` : undefined}>
                      <MapPin className="h-3 w-3" /> GPS off-site
                    </Badge>
                  )}
                  {d.ai_confidence && <Badge variant="outline">AI {d.ai_confidence}</Badge>}
                </div>
              </div>

              {d.ai_summary && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.ai_summary}</p>}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => view(d.id)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} View
                </Button>
                {canVerify && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => post(`/api/complaints/documents/${d.id}/run-ocr`, d.id)} disabled={busy}>
                      <RefreshCw className="h-4 w-4" /> Re-run OCR
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => post(`/api/complaints/documents/${d.id}/analyze`, d.id)} disabled={busy}>
                      <Sparkles className="h-4 w-4" /> Re-run AI
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => post(`/api/complaints/documents/${d.id}/vision`, d.id)} disabled={busy}>
                      <ScanEye className="h-4 w-4" /> Verify image
                    </Button>
                    <Button size="sm" onClick={() => setReviewDoc(d)}>
                      <ClipboardCheck className="h-4 w-4" /> Review &amp; apply
                    </Button>
                    {d.verification_status !== "Verified" && (
                      <Button size="sm" variant="ghost" onClick={() => verify(d.id, "Verified")} disabled={busy}>
                        <CheckCircle2 className="h-4 w-4" /> Mark verified
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!reviewDoc} onOpenChange={(o) => !o && setReviewDoc(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review extracted data</DialogTitle>
          </DialogHeader>
          {reviewDoc && <DocumentReview doc={reviewDoc} onDone={() => setReviewDoc(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
