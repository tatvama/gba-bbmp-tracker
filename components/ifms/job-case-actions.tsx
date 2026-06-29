"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScanText, Loader2, ShieldAlert, FileSearch, FileSignature, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runJobDocsOcrBatch, convertJobCaseToComplaint } from "@/lib/actions/ifms";

/**
 * Per-job-case actions: OCR the queued portal documents (looped in batches for a
 * progress count), then link to the existing forensic-audit + dossier pages, which
 * now read job_documents directly.
 */
export function JobCaseActions({
  jobNumber,
  jobCaseId,
  queuedCount,
  aiConfigured,
  complaintId,
}: {
  jobNumber: string;
  jobCaseId: string;
  queuedCount: number;
  aiConfigured: boolean;
  complaintId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [remaining, setRemaining] = React.useState(queuedCount);
  const [error, setError] = React.useState<string | null>(null);

  async function onConvert() {
    setConverting(true);
    setError(null);
    const r = await convertJobCaseToComplaint(jobCaseId);
    setConverting(false);
    if (!r.ok || !r.complaintId) {
      setError(r.error ?? "Could not convert.");
      return;
    }
    router.push(`/complaints/${r.complaintId}`);
  }

  async function onProcess() {
    setBusy(true);
    setError(null);
    let guard = 0;
    let left = remaining || 1;
    while (left > 0 && guard < 500) {
      guard++;
      const r = await runJobDocsOcrBatch(jobCaseId, { analyze: aiConfigured });
      if (!r.ok) {
        setError(r.error ?? "OCR failed.");
        break;
      }
      left = r.remaining ?? 0;
      setRemaining(left);
    }
    setBusy(false);
    router.refresh();
  }

  const auditHref = `/complaints/job/${encodeURIComponent(jobNumber)}/audit`;
  const dossierHref = `/complaints/job/${encodeURIComponent(jobNumber)}/dossier`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {remaining > 0 && (
        <Button size="sm" variant="outline" onClick={onProcess} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          {busy ? `OCR… ${remaining} left` : `Process docs (${remaining})`}
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href={auditHref}>
          <ShieldAlert className="h-4 w-4" /> Audit
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href={dossierHref}>
          <FileSearch className="h-4 w-4" /> Dossier
        </Link>
      </Button>
      {complaintId ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/complaints/${complaintId}`}>
            <ExternalLink className="h-4 w-4" /> Open complaint
          </Link>
        </Button>
      ) : (
        <Button size="sm" onClick={onConvert} disabled={converting}>
          {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
          Convert to complaint
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
