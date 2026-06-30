"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  UploadCloud,
  FileText,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  startRtiOfficeCopyImport,
  getRtiImportBatchAction,
  commitRtiLettersAction,
} from "@/lib/actions/rti";
import type { AnalyzedLetter } from "@/lib/rti/letter-import";

type EditableLetter = AnalyzedLetter & { uid: number };

type Phase = "idle" | "analyzing" | "review" | "committing";

export function RtiBulkImport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [batchId, setBatchId] = React.useState("");
  const [storagePath, setStoragePath] = React.useState("");
  const [pageCount, setPageCount] = React.useState(0);
  const [letters, setLetters] = React.useState<EditableLetter[]>([]);
  const uidRef = React.useRef(0);
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = React.useRef(true);

  // Show the detected PIO in the editable field: prefer a real name, else the
  // designation (so it's never blank); when folded in, drop the subtext copy.
  function seedLetters(raw: AnalyzedLetter[]): EditableLetter[] {
    return raw.map((l) => ({
      ...l,
      uid: uidRef.current++,
      pioName: l.pioName || l.pioDesignation || "",
      pioDesignation: l.pioName ? l.pioDesignation : null,
    }));
  }

  // Keep the batch id in the URL so a refresh can re-attach to the same import.
  function setImportParam(id: string | null) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (id) params.set("import", id);
    else params.delete("import");
    const qs = params.toString();
    router.replace(qs ? `/rti/new?${qs}` : "/rti/new", { scroll: false });
  }

  function stopPoll() {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }

  // Poll the background job until it is Ready / Failed / Committed.
  function poll(id: string) {
    stopPoll();
    const tick = async () => {
      let res;
      try {
        res = await getRtiImportBatchAction(id);
      } catch {
        if (activeRef.current) pollRef.current = setTimeout(tick, 3000);
        return;
      }
      if (!activeRef.current) return;
      if (res.error) {
        setError(res.error);
        setPhase("idle");
        setImportParam(null);
        return;
      }
      if (res.status === "Ready") {
        setStoragePath(res.storagePath || "");
        setPageCount(res.pageCount || 0);
        setLetters(seedLetters(res.letters || []));
        setPhase("review");
        return;
      }
      if (res.status === "Failed") {
        setError("Detection failed — please try again.");
        setPhase("idle");
        setImportParam(null);
        return;
      }
      if (res.status === "Committed") {
        // Cases were already created (e.g. refreshed after committing).
        setImportParam(null);
        router.push("/rti");
        return;
      }
      pollRef.current = setTimeout(tick, 2500); // still Processing
    };
    void tick();
  }

  // Resume an in-flight or completed import after a page refresh.
  React.useEffect(() => {
    activeRef.current = true;
    const existing = searchParams.get("import");
    if (existing) {
      setBatchId(existing);
      setPhase("analyzing");
      poll(existing);
    }
    return () => {
      activeRef.current = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setError(null);
    e.target.value = "";
  }

  async function analyze() {
    if (files.length === 0) return;
    setPhase("analyzing");
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await startRtiOfficeCopyImport(fd);
      if (res.error || !res.success || !res.batchId) {
        setError(res.error || "Could not start the import.");
        setPhase("idle");
        return;
      }
      setBatchId(res.batchId);
      setImportParam(res.batchId);
      poll(res.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the import");
      setPhase("idle");
    }
  }

  function updateSubject(uid: number, value: string) {
    setLetters((prev) => prev.map((l) => (l.uid === uid ? { ...l, subject: value } : l)));
  }

  function updatePio(uid: number, value: string) {
    setLetters((prev) => prev.map((l) => (l.uid === uid ? { ...l, pioName: value } : l)));
  }

  function removeLetter(uid: number) {
    setLetters((prev) => prev.filter((l) => l.uid !== uid));
  }

  async function commit() {
    if (letters.length === 0) return;
    setPhase("committing");
    setError(null);
    try {
      const res = await commitRtiLettersAction({
        storagePath,
        batchId: batchId || undefined,
        letters: letters.map((l) => ({
          startPage: l.startPage,
          endPage: l.endPage,
          subject: (l.subject || "").trim(),
          ocrText: l.ocrText,
          authority: l.authority,
          category: l.category,
          referenceNumber: l.referenceNumber,
          pioName: (l.pioName || "").trim() || null,
          pioDesignation: l.pioDesignation,
          documentDate: l.documentDate,
        })),
      });
      if (res.error || !res.success) {
        setError(res.error || "Could not create the cases.");
        setPhase("review");
        return;
      }
      stopPoll();
      setImportParam(null);
      router.push("/rti");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create cases");
      setPhase("review");
    }
  }

  function reset() {
    stopPoll();
    setImportParam(null);
    setFiles([]);
    setLetters([]);
    setBatchId("");
    setStoragePath("");
    setPageCount(0);
    setError(null);
    setPhase("idle");
  }

  // ── Busy states ────────────────────────────────────────────────────────────
  if (phase === "analyzing" || phase === "committing") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">
            {phase === "analyzing"
              ? "Reading the PDF and detecting separate letters…"
              : "Creating one RTI case per letter…"}
          </p>
          <p className="text-xs text-muted-foreground">
            {phase === "analyzing"
              ? "Pages are merged, OCR'd, then analysed by AI. This runs in the background — it's safe to refresh or come back; you'll pick up right here."
              : "Splitting pages, summarising, and seeding filing dates."}
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── Review screen ────────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-6 space-y-5">
          {error && (
            <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3.5 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
            <Layers className="h-4.5 w-4.5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {letters.length} {letters.length === 1 ? "letter" : "letters"} detected
              </span>{" "}
              across {pageCount} {pageCount === 1 ? "page" : "pages"}. Review the subject for each —
              every letter below becomes its own RTI case with its own reference number. Remove any
              that shouldn&apos;t be created.
            </div>
          </div>

          <div className="space-y-3">
            {letters.map((l, idx) => (
              <div
                key={l.uid}
                className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/30"
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    {l.startPage === l.endPage
                      ? `Page ${l.startPage}`
                      : `Pages ${l.startPage}–${l.endPage}`}
                    {l.referenceNumber ? (
                      <span className="font-mono font-normal text-slate-400">· {l.referenceNumber}</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-rose-500 hover:text-rose-600"
                    onClick={() => removeLetter(l.uid)}
                    disabled={letters.length <= 1}
                    title={letters.length <= 1 ? "At least one letter is required" : "Remove this letter"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Subject / Title
                    </Label>
                    <Input
                      value={l.subject ?? ""}
                      onChange={(e) => updateSubject(l.uid, e.target.value)}
                      placeholder="Subject of this RTI letter"
                      className="mt-1 h-10"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      PIO (name or office)
                    </Label>
                    <Input
                      value={l.pioName ?? ""}
                      onChange={(e) => updatePio(l.uid, e.target.value)}
                      placeholder="e.g. Executive Engineer, Hebbal Division"
                      className="mt-1 h-10"
                    />
                    {l.pioDesignation && (
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {l.pioDesignation}
                      </p>
                    )}
                  </div>
                </div>
                {(l.authority || l.category) && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    {[l.authority, l.category].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-150 dark:border-slate-800/85 pt-4">
            <Button type="button" variant="outline" onClick={reset} className="h-10">
              Start over
            </Button>
            <Button type="button" onClick={commit} className="h-10 font-bold">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Create {letters.length} {letters.length === 1 ? "case" : "cases"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Idle / pick file ──────────────────────────────────────────────────────────
  return (
    <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
      <CardContent className="p-6 space-y-5">
        {error && (
          <p className="rounded-lg border border-rose-250/30 bg-rose-50/10 p-3.5 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50/30 p-3.5 dark:border-slate-800 dark:bg-slate-950/30">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Upload a single office-copy PDF that contains several RTI letters. The system reads it,
            detects each separate letter, and (after your review) creates one RTI case per letter —
            each with its own reference number, subject, and split application PDF.
          </p>
        </div>

        <label
          htmlFor="bulk-rti-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-250 bg-slate-50/40 px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
        >
          <UploadCloud className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Choose a PDF (or images)
          </span>
          <span className="text-xs text-slate-400">PDF, JPEG, PNG or WebP</span>
          <input
            id="bulk-rti-file"
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-slate-150 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-slate-400">
                  {(f.size / 1_048_576).toFixed(1)} MB
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end border-t border-slate-150 dark:border-slate-800/85 pt-4">
          <Button
            type="button"
            onClick={analyze}
            disabled={files.length === 0}
            className="h-10 font-bold"
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Detect letters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
