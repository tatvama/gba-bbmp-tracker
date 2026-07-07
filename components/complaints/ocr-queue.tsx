"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataToolbar, DataToolbarSearch } from "@/components/ui/data-toolbar";
import { formatDateTime } from "@/lib/format";
import { useTasks, useTaskActions } from "@/lib/jobs/client/use-task";
import { ACTIVE_JOB_STATUSES } from "@/lib/jobs/types";
import type { OcrJob } from "@/lib/types";

type Row = OcrJob & { document?: { id: string; title: string | null; complaint_id: string; ocr_status: string } | null };

const VARIANT: Record<string, BadgeProps["variant"]> = {
  Completed: "success", Processing: "secondary", Queued: "secondary", Failed: "destructive",
};

export function OcrQueue({ jobs }: { jobs: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  // Every OCR job for the current user, live from the shared Task Registry —
  // matched per row by entityId (the document id) below, not by any
  // per-row polling of its own. Resumes automatically: a job started on a
  // previous visit to this page still shows live here on remount.
  const ocrTasks = useTasks({ taskType: "ocr" });
  const { startTask } = useTaskActions();
  const anyOcrActive = ocrTasks.some((t) => ACTIVE_JOB_STATUSES.has(t.status));

  // Once nothing is actively OCR'ing, this row list's own server-fetched
  // `jobs` prop needs one more refresh to pick up the final status/attempts
  // (the same router.refresh()-while-active pattern document-list.tsx already
  // uses for its own OCR status column) — not a second job-status poll, just
  // Next.js's own "this page's data is stale" mechanism.
  React.useEffect(() => {
    if (!anyOcrActive) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [anyOcrActive, router]);

  async function runOcr(docId: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/complaints/documents/${docId}/run-ocr`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; jobId?: string } | null;
      if (body?.ok && body.jobId) {
        startTask(body.jobId, { taskType: "ocr", entityType: "complaint_document", entityId: docId });
      }
    } finally {
      setBusy(null);
    }
  }

  // The "AI" re-analyze action has no background job behind it yet (a real,
  // separate gap — flagged for a follow-up, not fixed here since it would
  // mean registering a new job type). Unchanged: still blocks the click.
  async function runAnalyze(url: string, key: string) {
    setBusy(key);
    try { await fetch(url, { method: "POST" }); } finally { setBusy(null); router.refresh(); }
  }

  if (jobs.length === 0) return <EmptyState title="No OCR jobs" description="OCR jobs appear here as documents are processed." />;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? jobs.filter((j) =>
        (j.document?.title ?? "").toLowerCase().includes(q) ||
        j.status.toLowerCase().includes(q) ||
        (j.error_message ?? "").toLowerCase().includes(q),
      )
    : jobs;

  return (
    <div>
      <DataToolbar>
        <DataToolbarSearch value={search} onChange={setSearch} placeholder="Search document, status, error…" />
        <span className="text-sm text-muted-foreground">
          {filtered.length === jobs.length ? `${jobs.length} jobs` : `${filtered.length} of ${jobs.length} jobs`}
        </span>
      </DataToolbar>
      {filtered.length === 0 ? (
        <EmptyState compact title="No matching jobs" description="Try a different search term." />
      ) : (
      <Table>
        <TableHeader><TableRow>
          <TableHead>Document</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead>
          <TableHead>Error</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {filtered.map((j) => {
            const docId = j.document?.id ?? j.document_id;
            const liveTask = ocrTasks.find((t) => t.entityId === docId);
            const liveActive = liveTask && ACTIVE_JOB_STATUSES.has(liveTask.status);
            return (
              <TableRow key={j.id}>
                <TableCell className="max-w-xs truncate">{j.document?.title ?? docId.slice(0, 8)}</TableCell>
                <TableCell>
                  {liveActive ? (
                    <Badge variant="secondary">
                      <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                      {liveTask.progress != null ? `Processing (${liveTask.progress}%)` : "Processing"}
                    </Badge>
                  ) : (
                    <Badge variant={VARIANT[j.status] ?? "muted"}>{j.status}</Badge>
                  )}
                </TableCell>
                <TableCell>{j.attempts}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-destructive">{j.error_message ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(j.completed_at ?? j.started_at ?? j.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {j.document?.complaint_id && (
                      <Button asChild size="sm" variant="ghost"><Link href={`/complaints/${j.document.complaint_id}`}><ExternalLink className="h-4 w-4" /></Link></Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy === `o${j.id}` || !!liveActive} onClick={() => runOcr(docId, `o${j.id}`)}>
                      {busy === `o${j.id}` || liveActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} OCR
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === `a${j.id}`} onClick={() => runAnalyze(`/api/complaints/documents/${docId}/analyze`, `a${j.id}`)}>
                      {busy === `a${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      )}
    </div>
  );
}
