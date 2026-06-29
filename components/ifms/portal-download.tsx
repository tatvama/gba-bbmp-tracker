"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { previewIfmsDownload, startIfmsDownloadRun, downloadNextJob, type PreviewJob } from "@/lib/actions/ifms";

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
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const downloadableCodes = React.useMemo(() => jobs.filter((j) => j.exists && j.fileCount > 0).map((j) => j.jobCode), [jobs]);
  const totalFiles = React.useMemo(() => jobs.reduce((s, j) => s + j.fileCount, 0), [jobs]);

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

  async function onDownload() {
    setError(null);
    setPhase("downloading");
    setProgress({ total: downloadableCodes.length, jobsDone: 0, filesDownloaded: 0, filesFailed: 0 });

    const start = await startIfmsDownloadRun({ targets, codes: downloadableCodes });
    if (!start.ok || !start.runId) {
      setError(start.error ?? "Could not start the download.");
      setPhase("preview");
      return;
    }

    // Drive the run one job at a time so progress is live and the run is resumable.
    let done = false;
    let guard = 0;
    while (!done && guard < downloadableCodes.length + 5) {
      guard++;
      const step = await downloadNextJob(start.runId);
      if (!step.ok) {
        setError(step.error ?? "Download failed.");
        break;
      }
      setProgress({
        total: step.total,
        jobsDone: step.jobsDone,
        filesDownloaded: (progressRef.current?.filesDownloaded ?? 0) + step.filesDownloaded,
        filesFailed: (progressRef.current?.filesFailed ?? 0) + step.filesFailed,
        currentJob: step.jobCode,
      });
      done = step.done;
    }
    setPhase("done");
    router.refresh();
  }

  // Keep a ref of the latest progress so the loop can accumulate file counts.
  const progressRef = React.useRef<Progress | null>(null);
  React.useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

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
            </p>
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
