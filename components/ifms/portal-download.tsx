"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { previewIfmsDownload, startIfmsDownloadRun, type PreviewJob } from "@/lib/actions/ifms";
import { useTask } from "@/lib/jobs/client/use-task";

type Phase = "idle" | "previewing" | "preview" | "downloading" | "done";

interface Progress {
  total: number;
  jobsDone: number;
  filesDownloaded: number;
  filesFailed: number;
  currentJob?: string;
}

export function PortalDownload() {
  const router = useRouter();
  const [targets, setTargets] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [jobs, setJobs] = React.useState<PreviewJob[]>([]);
  const [invalid, setInvalid] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const downloadableCodes = React.useMemo(() => jobs.filter((j) => j.exists && j.fileCount > 0).map((j) => j.jobCode), [jobs]);
  const totalFiles = React.useMemo(() => jobs.reduce((s, j) => s + j.fileCount, 0), [jobs]);

  // No entityId is knowable before a run starts (each click creates a fresh
  // job_download_run) — a user only ever runs one portal download at a time
  // in practice, so "any active ifms_download job for me" is the identity.
  // This is also what makes resumption automatic: if a download was already
  // running before this component mounted, `task` reflects it immediately.
  const { task, startTask, cancel } = useTask({ taskType: "ifms_download" });

  const prevTaskStatusRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    const status = task?.status;
    if (status === prevTaskStatusRef.current) return;
    prevTaskStatusRef.current = status;
    if (!status) return;
    if (status === "queued" || status === "running" || status === "retrying") {
      setPhase("downloading");
    } else if (status === "done" || status === "failed" || status === "cancelled") {
      if (status === "failed") setError(task?.error ?? "Download failed.");
      setPhase("done");
      router.refresh();
    }
  }, [task?.status, task?.error, router]);

  const progress: Progress | null = React.useMemo(() => {
    if (phase !== "downloading" && phase !== "done") return null;
    const res = (task?.result ?? null) as { jobsDone?: number; total?: number; currentJob?: string | null; filesDownloaded?: number; filesFailed?: number } | null;
    return {
      total: res?.total ?? downloadableCodes.length,
      jobsDone: res?.jobsDone ?? 0,
      filesDownloaded: res?.filesDownloaded ?? 0,
      filesFailed: res?.filesFailed ?? 0,
      currentJob: res?.currentJob ?? undefined,
    };
  }, [task, phase, downloadableCodes.length]);

  async function onPreview() {
    setError(null);
    setPhase("previewing");
    setJobs([]);
    setInvalid([]);
    const res = await previewIfmsDownload({ targets });
    if (!res.ok) {
      setError(res.error ?? "Preview failed.");
      setInvalid(res.invalid ?? []);
      setPhase("idle");
      return;
    }
    setJobs(res.jobs ?? []);
    setInvalid(res.invalid ?? []);
    setPhase("preview");
  }

  // The download runs as an autonomous background job (lib/jobs/handlers/
  // ifms-download.ts) — starting it and closing the tab no longer stalls the
  // run. useTask above (not a poll loop owned by this component) reflects
  // its live progress from the shared Task Registry.
  async function onDownload() {
    setError(null);
    setPhase("downloading");

    const start = await startIfmsDownloadRun({ targets, codes: downloadableCodes });
    if (!start.ok || !start.jobId) {
      setError(start.error ?? "Could not start the download.");
      setPhase("preview");
      return;
    }
    startTask(start.jobId);
  }

  async function cancelDownload() {
    await cancel();
  }

  const busy = phase === "previewing" || phase === "downloading";
  const pct = progress && progress.total > 0 ? Math.round((progress.jobsDone / progress.total) * 100) : 0;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="space-y-1.5">
          <Label htmlFor="targets">Job code(s) or ward + year</Label>
          <Input
            id="targets"
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder="e.g. 044-22-000011  ·  or  ·  044-22  ·  one per line / comma-separated"
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            A full code <span className="font-mono">044-22-000011</span> fetches one job. A ward+year{" "}
            <span className="font-mono">044-22</span> walks every serial in that ward/year. Loose forms like{" "}
            <span className="font-mono">44 2022</span> work too.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onPreview} disabled={busy || !targets.trim()} variant="outline">
            {phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Preview
          </Button>
          {phase === "preview" && downloadableCodes.length > 0 && (
            <Button onClick={onDownload} disabled={busy}>
              <Download className="h-4 w-4" />
              Download {downloadableCodes.length} job{downloadableCodes.length === 1 ? "" : "s"} ({totalFiles} files)
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {invalid.length > 0 && (
          <p className="text-xs text-amber-600">Could not understand: {invalid.join(", ")} (expected a ward+year, e.g. 44 2022).</p>
        )}

        {/* Preview table */}
        {(phase === "preview" || phase === "downloading" || phase === "done") && jobs.length > 0 && (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Job code</th>
                  <th className="px-3 py-2 font-medium">Files</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobCode} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono">{j.jobCode}</td>
                    <td className="px-3 py-2">{j.fileCount}</td>
                    <td className="px-3 py-2">
                      {!j.exists ? (
                        <Badge variant="muted">Not on portal</Badge>
                      ) : j.fileCount === 0 ? (
                        <Badge variant="muted">No files</Badge>
                      ) : (
                        <Badge variant="success">Ready</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Progress */}
        {progress && (phase === "downloading" || phase === "done") && (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {phase === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {phase === "done" ? "Download complete — " : `Downloading ${progress.currentJob ?? ""}… `}
              {progress.jobsDone}/{progress.total} jobs · {progress.filesDownloaded} files saved
              {progress.filesFailed > 0 ? ` · ${progress.filesFailed} failed` : ""}
              {phase === "downloading" && task && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={cancelDownload}>Cancel</Button>
              )}
            </p>
            {phase === "downloading" && (
              <p className="text-xs text-muted-foreground">
                Safe to navigate away — this keeps downloading in the background and you can check back, or watch it from the Task Center.
              </p>
            )}
            {phase === "done" && (
              <p className="text-xs text-muted-foreground">
                The downloaded job cases appear below. Open one to run OCR + the forensic audit.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
