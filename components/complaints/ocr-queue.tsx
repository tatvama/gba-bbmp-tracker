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
import { formatDateTime } from "@/lib/format";
import type { OcrJob } from "@/lib/types";

type Row = OcrJob & { document?: { id: string; title: string | null; complaint_id: string; ocr_status: string } | null };

const VARIANT: Record<string, BadgeProps["variant"]> = {
  Completed: "success", Processing: "secondary", Queued: "secondary", Failed: "destructive",
};

export function OcrQueue({ jobs }: { jobs: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(url: string, key: string) {
    setBusy(key);
    try { await fetch(url, { method: "POST" }); } finally { setBusy(null); router.refresh(); }
  }

  if (jobs.length === 0) return <EmptyState title="No OCR jobs" description="OCR jobs appear here as documents are processed." />;

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Document</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead>
          <TableHead>Error</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {jobs.map((j) => {
            const docId = j.document?.id ?? j.document_id;
            return (
              <TableRow key={j.id}>
                <TableCell className="max-w-xs truncate">{j.document?.title ?? docId.slice(0, 8)}</TableCell>
                <TableCell><Badge variant={VARIANT[j.status] ?? "muted"}>{j.status}</Badge></TableCell>
                <TableCell>{j.attempts}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-destructive">{j.error_message ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(j.completed_at ?? j.started_at ?? j.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {j.document?.complaint_id && (
                      <Button asChild size="sm" variant="ghost"><Link href={`/complaints/${j.document.complaint_id}`}><ExternalLink className="h-4 w-4" /></Link></Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy === `o${j.id}`} onClick={() => run(`/api/complaints/documents/${docId}/run-ocr`, `o${j.id}`)}>
                      {busy === `o${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} OCR
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === `a${j.id}`} onClick={() => run(`/api/complaints/documents/${docId}/analyze`, `a${j.id}`)}>
                      {busy === `a${j.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
