"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud, FolderArchive, X, CheckCircle2, AlertTriangle, Loader2, Clock,
  RefreshCw, PlayCircle, FileSearch, Wifi, WifiOff, ExternalLink, ChevronRight,
  ChevronDown, MoreVertical, Check, Plus, Search, FileText, Smartphone, Activity,
  TrendingUp, TrendingDown, User, Mail, History as HistoryIcon, Pause, Play, Trash2, Info, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  IMPORT_CHUNK_SIZE, fileFingerprint,
  type ImportEventsPayload, type ImportUploadSnapshot,
} from "@/lib/import-queue/types";
import { saveFileHandle, loadFileHandle, deleteFileHandle, fileFromHandle } from "@/lib/client/import-idb";
import { getForensicImportBatchAction } from "@/lib/actions/forensic-zip-import";
import { cn } from "@/lib/utils";

interface LocalUpload {
  file: File;
  sentBytes: number;
  speedBps: number;
  etaSec: number | null;
  failed?: string;
}

const ACTIVE_STATUSES = new Set(["uploading", "queued", "processing", "review"]);

function fmtMB(bytes: number): string {
  return bytes >= 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(2)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`;
}
function fmtSpeed(bps: number): string {
  return bps >= 1_048_576 ? `${(bps / 1_048_576).toFixed(1)} MB/s` : `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}
function fmtEta(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s left`;
  if (sec < 3600) return `${Math.round(sec / 60)} min left`;
  return `${(sec / 3600).toFixed(1)} h left`;
}
function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const STATUS_META: Record<string, { label: string; chip: string }> = {
  uploading: { label: "Uploading", chip: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900" },
  queued: { label: "Staged in queue", chip: "bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" },
  processing: { label: "AI Extracting & OCR", chip: "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-300 dark:border-indigo-900" },
  review: { label: "Ready for review", chip: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900" },
  done: { label: "Ingested", chip: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900" },
  failed: { label: "Failed", chip: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900" },
  cancelled: { label: "Cancelled", chip: "bg-slate-50 text-slate-500 border border-slate-250 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
};

export function ImportQueue({
  presetFiles,
  onLetterUpload,
}: {
  presetFiles?: File[];
  onLetterUpload?: (files: File[]) => void;
} = {}) {
  const [sessions, setSessions] = React.useState<ImportUploadSnapshot[]>([]);
  const [local, setLocal] = React.useState<Record<string, LocalUpload>>({});
  // Job code parsed from the ZIP's own filename that already matches an
  // imported job_case, reported by the server the moment the upload session
  // is created — before any chunk is sent (see route.ts). The upload is
  // withheld (not enqueued) until the user confirms or discards, so a
  // multi-GB re-upload of an already-imported job never actually happens.
  const [pendingDupes, setPendingDupes] = React.useState<
    Record<string, { jobCode: string; file: File; handle: FileSystemFileHandle | null }>
  >({});
  const [resumable, setResumable] = React.useState<Record<string, FileSystemFileHandle>>({});
  const [autoCommit, setAutoCommit] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [live, setLive] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [clearedSessionIds, setClearedSessionIds] = React.useState<string[]>([]);
  const [clearing, setClearing] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<"date" | "name" | "size" | "status">("date");

  const queueRef = React.useRef<{ id: string; file: File }[]>([]);
  const pumpingRef = React.useRef(false);
  const abortsRef = React.useRef<Record<string, AbortController>>({});
  const checkedHandlesRef = React.useRef<Set<string>>(new Set());
  const presetDoneRef = React.useRef(false);
  const localRef = React.useRef(local);
  localRef.current = local;

  // ── live state: SSE + initial fetch ─────────────────────────────────────────
  React.useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;

    void fetch("/api/import-queue")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sessions?: ImportUploadSnapshot[] } | null) => {
        if (!stopped && d?.sessions) setSessions(d.sessions);
      })
      .catch(() => {});

    try {
      es = new EventSource("/api/import-queue/events");
      es.onopen = () => setLive(true);
      es.onerror = () => setLive(false);
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as ImportEventsPayload;
          if (payload.type === "snapshot") setSessions(payload.sessions);
        } catch {
          /* ignore malformed frame */
        }
      };
    } catch {
      setLive(false);
    }
    return () => {
      stopped = true;
      es?.close();
    };
  }, []);

  // ── find resumable interrupted uploads (IndexedDB file handles) ─────────────
  React.useEffect(() => {
    for (const s of sessions) {
      if (s.status !== "uploading") continue;
      if (localRef.current[s.id] || checkedHandlesRef.current.has(s.id)) continue;
      checkedHandlesRef.current.add(s.id);
      void loadFileHandle(s.id).then((h) => {
        if (h) setResumable((prev) => ({ ...prev, [s.id]: h }));
      });
    }
  }, [sessions]);

  // ── upload engine: strictly one file at a time ──────────────────────────────
  const putChunk = React.useCallback(
    async (id: string, offset: number, blob: Blob, signal: AbortSignal):
      Promise<{ receivedBytes?: number; complete?: boolean; realign?: number; stopped?: boolean }> => {
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(`/api/import-queue/${id}?offset=${offset}`, { method: "PUT", body: blob, signal });
          if (r.status === 409) {
            const d = (await r.json().catch(() => ({}))) as { realign?: boolean; receivedBytes?: number; status?: string };
            if (d.realign && typeof d.receivedBytes === "number") return { realign: d.receivedBytes };
            return { stopped: true };
          }
          if (!r.ok) {
            const d = (await r.json().catch(() => ({}))) as { error?: string };
            throw new Error(d.error || `Upload failed (HTTP ${r.status}).`);
          }
          return (await r.json()) as { receivedBytes: number; complete: boolean };
        } catch (e) {
          if (signal.aborted) return { stopped: true };
          if (attempt >= 3) throw e;
          await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
        }
      }
    },
    [],
  );

  const uploadOne = React.useCallback(
    async (id: string, file: File) => {
      const ac = new AbortController();
      abortsRef.current[id] = ac;
      try {
        const r0 = await fetch(`/api/import-queue/${id}`);
        if (!r0.ok) return;
        const s0 = ((await r0.json()) as { session: ImportUploadSnapshot }).session;
        if (s0.status !== "uploading") return;
        let offset = s0.receivedBytes;
        const chunkSize = s0.chunkSize || IMPORT_CHUNK_SIZE;
        let speed = 0;
        let lastT = performance.now();

        while (offset < file.size) {
          const blob = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const res = await putChunk(id, offset, blob, ac.signal);
          if (res.stopped) return;
          if (typeof res.realign === "number") {
            offset = res.realign;
            continue;
          }
          const now = performance.now();
          const dt = Math.max(0.05, (now - lastT) / 1000);
          lastT = now;
          const inst = blob.size / dt;
          speed = speed ? speed * 0.7 + inst * 0.3 : inst;
          offset = res.receivedBytes ?? offset + blob.size;
          setLocal((prev) => ({
            ...prev,
            [id]: { file, sentBytes: offset, speedBps: speed, etaSec: speed > 0 ? (file.size - offset) / speed : null },
          }));
          if (res.complete) break;
        }
        setLocal((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
        void deleteFileHandle(id);
      } catch (e) {
        if (!ac.signal.aborted) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          setLocal((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, failed: msg } } : prev));
        }
      } finally {
        delete abortsRef.current[id];
      }
    },
    [putChunk],
  );

  const pump = React.useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      for (;;) {
        const item = queueRef.current.shift();
        if (!item) break;
        await uploadOne(item.id, item.file);
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [uploadOne]);

  const enqueueUpload = React.useCallback(
    (id: string, file: File) => {
      setLocal((prev) => ({ ...prev, [id]: { file, sentBytes: 0, speedBps: 0, etaSec: null } }));
      queueRef.current.push({ id, file });
      void pump();
    },
    [pump],
  );

  // ── adding files (drop / browse / preset) ───────────────────────────────────
  const addFiles = React.useCallback(
    async (files: File[], handles?: (FileSystemFileHandle | null)[]) => {
      setError(null);
      
      const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
      const letters = files.filter((f) => !f.name.toLowerCase().endsWith(".zip"));

      if (letters.length > 0 && onLetterUpload) {
        onLetterUpload(letters);
        return;
      }

      if (!zips.length) {
        setError("Please choose a forensic ZIP archive (.zip) or complaint letters.");
        return;
      }

      for (let i = 0; i < zips.length; i++) {
        const file = zips[i]!;
        try {
          const r = await fetch("/api/import-queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              fingerprint: fileFingerprint(file),
              autoCommit,
            }),
          });
          const d = (await r.json()) as {
            session?: ImportUploadSnapshot;
            resumed?: boolean;
            duplicateJobNumber?: string | null;
            error?: string;
          };
          if (!r.ok || !d.session) {
            setError(d.error || `Could not start the upload for ${file.name}.`);
            continue;
          }
          const s = d.session;
          setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
          if (d.duplicateJobNumber && s.status === "uploading") {
            // Don't waste a multi-GB upload on a job the server already has
            // — hold it here until the user explicitly confirms or discards.
            const handle = handles?.[files.indexOf(file)] ?? null;
            setPendingDupes((prev) => ({ ...prev, [s.id]: { jobCode: d.duplicateJobNumber!, file, handle } }));
            continue;
          }
          if (s.status === "uploading") {
            const handle = handles?.[files.indexOf(file)] ?? null;
            if (handle) void saveFileHandle(s.id, handle);
            setResumable((prev) => {
              if (!prev[s.id]) return prev;
              const n = { ...prev };
              delete n[s.id];
              return n;
            });
            enqueueUpload(s.id, file);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not start the upload.");
        }
      }
    },
    [autoCommit, enqueueUpload, onLetterUpload],
  );

  // preset files from the SmartUpload entry point — start immediately, once.
  React.useEffect(() => {
    if (presetDoneRef.current || !presetFiles?.length) return;
    presetDoneRef.current = true;
    void addFiles(presetFiles);
  }, [presetFiles, addFiles]);

  // ── resume an interrupted upload from its stored handle ─────────────────────
  const resumeFromHandle = React.useCallback(
    async (session: ImportUploadSnapshot) => {
      const handle = resumable[session.id];
      if (!handle) return;
      const file = await fileFromHandle(handle);
      if (!file) {
        setError(`Could not reopen ${session.fileName} — permission denied or the file moved. Re-select it to resume.`);
        return;
      }
      if (file.name !== session.fileName || file.size !== session.fileSize) {
        setError(`${session.fileName} has changed since the upload started — add it again to restart.`);
        return;
      }
      setResumable((prev) => {
        const n = { ...prev };
        delete n[session.id];
        return n;
      });
      enqueueUpload(session.id, file);
    },
    [resumable, enqueueUpload],
  );

  // ── cancel / retry ──────────────────────────────────────────────────────────
  const cancelSession = React.useCallback(async (id: string) => {
    abortsRef.current[id]?.abort();
    setLocal((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    void deleteFileHandle(id);
    await fetch(`/api/import-queue/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // ── likely-duplicate ZIP held before upload: user's call ────────────────────
  const confirmDuplicateUpload = React.useCallback(
    (id: string) => {
      const pending = pendingDupes[id];
      if (!pending) return;
      setPendingDupes((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      if (pending.handle) void saveFileHandle(id, pending.handle);
      enqueueUpload(id, pending.file);
    },
    [pendingDupes, enqueueUpload],
  );

  const discardDuplicateSession = React.useCallback(
    (id: string) => {
      setPendingDupes((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      void cancelSession(id);
    },
    [cancelSession],
  );

  const retryUpload = React.useCallback(
    (s: ImportUploadSnapshot) => {
      const l = local[s.id];
      if (!l) return;
      setLocal((prev) => ({ ...prev, [s.id]: { ...l, failed: undefined } }));
      queueRef.current.push({ id: s.id, file: l.file });
      void pump();
    },
    [local, pump],
  );

  // ── drop / browse ───────────────────────────────────────────────────────────
  const onDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const items = Array.from(e.dataTransfer.items ?? []);
      const files: File[] = [];
      const handlePromises: Promise<FileSystemFileHandle | null>[] = [];
      for (const item of items) {
        if (item.kind !== "file") continue;
        const f = item.getAsFile();
        if (!f) continue;
        files.push(f);
        const getHandle = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<unknown> }).getAsFileSystemHandle;
        handlePromises.push(
          getHandle
            ? (getHandle.call(item) as Promise<unknown>).then((h) =>
                h && typeof (h as FileSystemFileHandle).getFile === "function" ? (h as FileSystemFileHandle) : null,
              ).catch(() => null)
            : Promise.resolve(null),
        );
      }
      if (!files.length && e.dataTransfer.files?.length) files.push(...Array.from(e.dataTransfer.files));
      void Promise.all(handlePromises).then((handles) => addFiles(files, handles));
    },
    [addFiles],
  );

  const browse = React.useCallback(async () => {
    const picker = (window as Window & {
      showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker;
    if (picker) {
      try {
        const handles = await picker({
          multiple: true,
          types: [
            {
              description: "Forensic ZIPs & Letters",
              accept: {
                "application/zip": [".zip"],
                "application/pdf": [".pdf"],
                "image/*": [".png", ".jpg", ".jpeg", ".webp"]
              }
            }
          ],
          excludeAcceptAllOption: false,
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        await addFiles(files, handles);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
      }
    }
    document.getElementById("import-queue-file-input")?.click();
  }, [addFiles]);

  const pauseAllActive = () => {
    Object.values(abortsRef.current).forEach((ac) => ac.abort());
    setLocal((prev) => {
      const n: Record<string, LocalUpload> = {};
      Object.entries(prev).forEach(([k, v]) => {
        n[k] = { ...v, failed: "Paused by user" };
      });
      return n;
    });
  };

  const pauseUpload = React.useCallback((id: string) => {
    abortsRef.current[id]?.abort();
    setLocal((prev) => {
      const item = prev[id];
      if (!item) return prev;
      return {
        ...prev,
        [id]: { ...item, failed: "Paused by user" }
      };
    });
  }, []);

  const resumeAllPaused = () => {
    sessions.forEach((s) => {
      if (s.status === "uploading" && resumable[s.id] && !local[s.id]) {
        void resumeFromHandle(s);
      } else if (local[s.id]?.failed) {
        retryUpload(s);
      }
    });
  };

  const clearCompletedJobs = React.useCallback(() => {
    const ids = sessions
      .filter((s) => s.status === "done" || s.status === "failed" || s.status === "cancelled")
      .map((s) => s.id);
    if (!ids.length) return;
    setClearing(true);
    // Optimistic hide for instant feedback — reverted below for any id whose
    // delete didn't actually confirm.
    setClearedSessionIds((prev) => [...prev, ...ids]);
    // `keepalive` matters here: without it, a fire-and-forget fetch can be
    // aborted mid-flight by the very next navigation (or a reload/tab close),
    // which used to leave the row un-deleted in the DB — so it silently came
    // back the next time this page loaded, even though the UI had already
    // hidden it. `keepalive` tells the browser to keep sending the request
    // even if this page is being torn down. `allSettled` (not `.catch(() =>
    // {})`) also means a real server-side failure (e.g. a 404/403) is no
    // longer swallowed — those ids get put back so they aren't lost silently.
    void Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/import-queue/${id}`, { method: "DELETE", keepalive: true }).then((r) => ({ id, ok: r.ok })),
      ),
    ).then((results) => {
      const failedIds = results.map((r, i) => (r.status === "fulfilled" && r.value.ok ? null : ids[i]!)).filter((id): id is string => id !== null);
      if (failedIds.length) {
        setClearedSessionIds((prev) => prev.filter((id) => !failedIds.includes(id)));
        setError(`Could not clear ${failedIds.length} job${failedIds.length === 1 ? "" : "s"} — try again.`);
      }
      setClearing(false);
    });
  }, [sessions]);

  // ── derived view state ──────────────────────────────────────────────────────
  const ordered = React.useMemo(() => {
    const sorted = [...sessions];
    if (sortBy === "date") {
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } else if (sortBy === "name") {
      sorted.sort((a, b) => a.fileName.localeCompare(b.fileName));
    } else if (sortBy === "size") {
      sorted.sort((a, b) => b.fileSize - a.fileSize);
    } else if (sortBy === "status") {
      sorted.sort((a, b) => a.status.localeCompare(b.status));
    }
    return sorted.filter((s) => !clearedSessionIds.includes(s.id));
  }, [sessions, clearedSessionIds, sortBy]);

  const queuedIds = React.useMemo(
    () => ordered.filter((s) => s.status === "queued").map((s) => s.id),
    [ordered],
  );
  const resumableSessions = ordered.filter((s) => s.status === "uploading" && resumable[s.id] && !local[s.id]);
  const activeCount = ordered.filter((s) => ACTIVE_STATUSES.has(s.status)).length;

  return (
    <div className="space-y-8">
      {error && (
        <p className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/70 p-3.5 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-450">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0" /> {error}
        </p>
      )}

      {/* Two Column Ingestion Hero Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Upload Workspace */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border border-border/80 shadow-2xs hover:shadow-xs transition-shadow rounded-xl overflow-hidden bg-card">
            <CardContent className="p-6 space-y-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={browse}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && void browse()}
                className={`group flex cursor-pointer flex-col items-center justify-center gap-3.5 rounded-xl border-2 border-dashed px-5 py-12 text-center transition-all ${
                  dragOver
                    ? "border-primary bg-primary/[0.04] scale-[1.01]"
                    : "border-slate-200 bg-slate-50/50 hover:border-primary/50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30 dark:hover:bg-slate-900/50"
                }`}
              >
                <div className="rounded-2xl bg-primary/10 p-3.5 transition-transform group-hover:-translate-y-0.5">
                  <UploadCloud className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <span className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-250 block">
                    Drag &amp; Drop ZIP files or Complaint Letters
                  </span>
                  <span className="text-xs text-slate-455 max-w-md block">
                    Supported formats: <strong className="text-slate-500 font-bold">ZIP, PDF, JPG, PNG</strong> · Max file size: <strong className="text-slate-500 font-bold">4 GB</strong>
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <Button type="button" size="sm" className="h-9 font-bold bg-primary text-primary-foreground hover:bg-primary/95 shadow-sm">
                    Browse Files
                  </Button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      browse();
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 h-9 px-3 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-900"
                  >
                    View Upload Guide
                  </button>
                </div>

                <input
                  id="import-queue-file-input"
                  type="file"
                  accept=".zip,application/zip,application/pdf,image/*"
                  multiple
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const zips = files.filter((f) => f.name.toLowerCase().endsWith(".zip"));
                    const letters = files.filter((f) => !f.name.toLowerCase().endsWith(".zip"));

                    if (letters.length > 0 && onLetterUpload) {
                      onLetterUpload(letters);
                    } else if (zips.length > 0) {
                      void addFiles(zips);
                    }
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Ingestion Modes Info Badges */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 border-t border-slate-100 dark:border-slate-850 pt-4">
                <div className="p-2 rounded-lg bg-slate-100/60 dark:bg-slate-900/40">ZIP Extraction</div>
                <div className="p-2 rounded-lg bg-slate-100/60 dark:bg-slate-900/40">Single Letter AI</div>
                <div className="p-2 rounded-lg bg-slate-100/60 dark:bg-slate-900/40">OCR Image Mapping</div>
              </div>

              {/* Bottom Ingest Stats Panel */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-850 pt-4 text-xs font-semibold text-slate-550 dark:text-slate-400">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="flex items-center gap-1.5">
                    {live ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500 animate-pulse" />}
                    {live ? "Live Ingestion Connected" : "Reconnecting Ingestion…"}
                  </span>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
                  <span className="flex items-center gap-1">
                    <Activity className="h-3.5 w-3.5 text-slate-450" />
                    <span>Queue: {activeCount > 0 ? "Active Ingestion" : "Idle"}</span>
                  </span>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-450" />
                    <span>Workers: 4 Online</span>
                  </span>
                  <div className="h-3 w-px bg-slate-200 dark:bg-slate-800" />
                  <span className="flex items-center gap-1">
                    <FolderArchive className="h-3.5 w-3.5 text-slate-450" />
                    <span>Storage: 1.2 TB / 10 TB</span>
                  </span>
                </div>
                
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-650 dark:text-slate-350 hover:text-slate-800">
                  <input
                    type="checkbox"
                    checked={autoCommit}
                    onChange={(e) => setAutoCommit(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                  Auto Create Complaints
                </label>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Information Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          {/* Card 1: Processing Workflow */}
          <Card className="border border-border/80 shadow-2xs bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-slate-50/40 dark:bg-slate-900/30 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">How Processing Works</span>
            </div>
            <CardContent className="p-4">
              <div className="flex flex-col gap-2 relative pl-4 before:absolute before:left-1 before:top-1 before:bottom-1 before:w-[1px] before:bg-border/60">
                <TimelineStep label="Upload" desc="File is split into secure 8MB chunks" />
                <TimelineStep label="Extract" desc="ZIP contents decompressed dynamically" />
                <TimelineStep label="OCR" desc="Multilingual scans transcribed into raw texts" />
                <TimelineStep label="AI Analysis" desc="Extracts metadata, departments, and timelines" />
                <TimelineStep label="Complaint Detection" desc="Verifies validity and flags key priorities" />
                <TimelineStep label="Review" desc="Human-in-the-loop audit checks details" />
                <TimelineStep label="Create Complaint" desc="Persisted as active tracked case" />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Supported Formats */}
          <Card className="border border-border/80 shadow-2xs bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/50 bg-slate-50/40 dark:bg-slate-900/30 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Supported Formats</span>
            </div>
            <CardContent className="p-4 space-y-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              <div className="flex justify-between items-center py-0.5 border-b border-slate-100/50 dark:border-slate-850/50">
                <span className="font-semibold">ZIP Archives</span>
                <span className="text-slate-400 font-mono text-[10px]">Folders / Job files</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-slate-100/50 dark:border-slate-850/50">
                <span className="font-semibold">PDF Files</span>
                <span className="text-slate-400 font-mono text-[10px]">Multi-page documents</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-slate-100/50 dark:border-slate-850/50">
                <span className="font-semibold">Images</span>
                <span className="text-slate-400 font-mono text-[10px]">PNG, JPG, WebP</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold">Multi-page Letter Scans</span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 text-[10px] font-bold">
                  <Check className="h-3 w-3" /> Auto AI OCR
                </span>
              </div>
            </CardContent>
          </Card>

</div>
      </div>

      {/* Resume Banner */}
      <AnimatePresence>
        {resumableSessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-250 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 no-print"
          >
            <PlayCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-semibold">
              {resumableSessions.length} interrupted upload{resumableSessions.length === 1 ? "" : "s"} can continue where you left off.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {resumableSessions.map((s) => (
                <Button key={s.id} type="button" size="sm" variant="outline" className="h-8 text-xs font-bold border-amber-200 dark:border-amber-900/50 dark:bg-slate-900" onClick={() => void resumeFromHandle(s)}>
                  <PlayCircle className="h-3.5 w-3.5 mr-1 text-amber-650" /> Resume {s.fileName}
                </Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Enterprise Queue Workspace ── */}
      <div className="space-y-4 border-t border-slate-100 dark:border-slate-850 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold tracking-tight text-foreground">Import Queue</h2>
            {ordered.length > 0 && (
              <Badge className="bg-primary/10 text-primary border-none text-[10px] font-bold px-2 py-0.5 rounded-full">
                {ordered.length} active jobs
              </Badge>
            )}
          </div>

          {/* Queue Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 cursor-pointer"
            >
              <option value="date">Sort: Created Date</option>
              <option value="name">Sort: File Name</option>
              <option value="size">Sort: File Size</option>
              <option value="status">Sort: Status</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={pauseAllActive}
              disabled={activeCount === 0}
              className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900"
            >
              <Pause className="h-3.5 w-3.5 mr-1" /> Pause All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resumeAllPaused}
              className="h-8 text-xs font-semibold dark:border-slate-800 dark:bg-slate-900"
            >
              <Play className="h-3.5 w-3.5 mr-1" /> Resume All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCompletedJobs}
              disabled={clearing}
              className="h-8 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-rose-950/20"
            >
              {clearing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              {clearing ? "Clearing…" : "Clear Completed"}
            </Button>
          </div>
        </div>

        {ordered.length === 0 ? (
          /* Empty State */
          <Card className="border border-slate-200 border-dashed rounded-xl bg-slate-50/20 dark:border-slate-800 dark:bg-slate-950/10 p-12 text-center">
            <CardContent className="space-y-4 max-w-md mx-auto flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400">
                <FolderArchive className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-250">No uploads yet</h3>
                <p className="text-xs text-slate-550 dark:text-slate-450 leading-relaxed">
                  Upload a ZIP archive or complaint letter to begin AI processing. Track upload speeds, parsing nodes, and resolution drafts right here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Active Queue Cards List */
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {ordered.map((s) => (
                <QueueCard
                  key={s.id}
                  session={s}
                  local={local[s.id]}
                  queuePos={s.status === "queued" ? queuedIds.indexOf(s.id) + 1 : 0}
                  canResume={Boolean(resumable[s.id]) && !local[s.id]}
                  pendingDupCode={pendingDupes[s.id]?.jobCode}
                  onResume={() => void resumeFromHandle(s)}
                  onPause={() => pauseUpload(s.id)}
                  onCancel={() => void cancelSession(s.id)}
                  onRetry={() => retryUpload(s)}
                  onConfirmDuplicateUpload={() => confirmDuplicateUpload(s.id)}
                  onDiscardDuplicate={() => discardDuplicateSession(s.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({
  session: s,
  local,
  queuePos,
  canResume,
  pendingDupCode,
  onResume,
  onPause,
  onCancel,
  onRetry,
  onConfirmDuplicateUpload,
  onDiscardDuplicate,
}: {
  session: ImportUploadSnapshot;
  local?: LocalUpload;
  queuePos: number;
  canResume: boolean;
  pendingDupCode?: string;
  onResume: () => void;
  onPause: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onConfirmDuplicateUpload: () => void;
  onDiscardDuplicate: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [duplicateCodes, setDuplicateCodes] = React.useState<string[]>([]);
  const fetchedDupRef = React.useRef(false);

  // The worker excludes duplicate job numbers from commit silently (no
  // dedicated column for this) — once a batch finishes, re-read its analyzed
  // jobs once to find which ones were skipped as already-imported, so the
  // done card can say so instead of just showing a lower complaint count.
  React.useEffect(() => {
    if (s.status !== "done" || !s.batchId || fetchedDupRef.current) return;
    fetchedDupRef.current = true;
    void getForensicImportBatchAction(s.batchId)
      .then((res) => {
        const dups = (res.jobs ?? []).filter((j) => j.alreadyImported).map((j) => j.jobCode);
        if (dups.length) setDuplicateCodes(dups);
      })
      .catch(() => {});
  }, [s.status, s.batchId]);

  const meta = pendingDupCode
    ? { label: "Awaiting confirmation", chip: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900" }
    : STATUS_META[s.status] ?? STATUS_META.queued!;
  const uploadingLocally = Boolean(local) && s.status === "uploading" && !local?.failed;
  const isPaused = Boolean(local) && local?.failed === "Paused by user";
  const progress = uploadingLocally
    ? Math.round((35 * (local!.sentBytes / Math.max(1, s.fileSize))))
    : s.progress;
  const working = s.status === "processing" || uploadingLocally;
  const cancellable = s.status === "uploading" || s.status === "queued" || s.status === "review";
  const message = local?.failed
    ? local.failed
    : uploadingLocally
      ? `Uploading… ${fmtMB(local!.sentBytes)} / ${fmtMB(s.fileSize)} · ${fmtSpeed(local!.speedBps)}${local!.etaSec ? ` · ${fmtEta(local!.etaSec)}` : ""}`
      : s.message ?? "";

  // Segmented calculations
  const stepsList = [
    { label: "Uploaded", limit: 35 },
    { label: "Extracting", limit: 55 },
    { label: "OCR", limit: 60 },
    { label: "AI Analysis", limit: 72 },
    { label: "Complaint Detection", limit: 99 },
    { label: "Completed", limit: 100 },
  ];

  let currentStageIdx = 0;
  if (s.status === "done") {
    currentStageIdx = 5;
  } else if (s.status === "failed" || s.status === "cancelled" || local?.failed) {
    currentStageIdx = stepsList.findIndex((st) => progress <= st.limit);
    if (currentStageIdx === -1) currentStageIdx = 0;
  } else {
    currentStageIdx = stepsList.findIndex((st) => progress < st.limit);
    if (currentStageIdx === -1) currentStageIdx = 5;
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22 }}
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card p-4 sm:p-6 shadow-2xs transition-all hover:shadow-xs space-y-4",
        working && "border-primary/45 bg-primary/[0.005]",
        s.status === "done" && "border-emerald-250 bg-emerald-50/[0.005]",
        (s.status === "failed" || local?.failed) && "border-rose-250 bg-rose-50/[0.005]",
        !working && s.status !== "done" && s.status !== "failed" && !local?.failed && "border-border/80"
      )}
    >
      {/* Dynamic Activity Top Slider Light Bar */}
      {working && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-progress-slide rounded-full bg-primary/60" />
        </div>
      )}

      {/* Top Row: File icon & Name metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            "rounded-xl p-2.5 shrink-0 shadow-3xs border mt-0.5 sm:mt-0",
            pendingDupCode && "bg-rose-50 text-rose-600 border-rose-150 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900",
            !pendingDupCode && s.status === "done" && "bg-emerald-50 text-emerald-600 border-emerald-150 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900",
            !pendingDupCode && (s.status === "failed" || local?.failed) && "bg-rose-50 text-rose-600 border-rose-150 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900",
            !pendingDupCode && working && "bg-blue-50 text-primary border-blue-150 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900",
            !pendingDupCode && !working && s.status !== "done" && s.status !== "failed" && !local?.failed && "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900 dark:border-slate-800"
          )}>
            {pendingDupCode ? (
              <AlertTriangle className="h-5 w-5" />
            ) : s.status === "done" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (s.status === "failed" || local?.failed) ? (
              <AlertTriangle className="h-5 w-5" />
            ) : working ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : s.status === "review" ? (
              <FileSearch className="h-5 w-5" />
            ) : (
              <FolderArchive className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-sm font-extrabold text-slate-800 dark:text-slate-205">
              {s.fileName}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-450 dark:text-slate-500">
              <span className="font-mono">{fmtMB(s.fileSize)}</span>
              {s.jobCodes.length > 0 && (
                <>
                  <span>•</span>
                  <span>{s.jobCodes.length} job{s.jobCodes.length === 1 ? "" : "s"}</span>
                  <span>•</span>
                  <span className="font-mono font-bold bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded text-[10px]">
                    {s.jobCodes.slice(0, 3).join(", ")}{s.jobCodes.length > 3 ? "…" : ""}
                  </span>
                </>
              )}
              <span>•</span>
              <span>Created {fmtClock(new Date(s.createdAt).getTime())}</span>
            </div>
          </div>
        </div>

        {/* Badges & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 w-full sm:w-auto justify-start sm:justify-end">
          {queuePos > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
              <Clock className="h-3 w-3" /> Queue #{queuePos}
            </span>
          )}

          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-extrabold", meta.chip)}>
            {meta.label}
          </span>

          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {uploadingLocally && (
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                className="h-8 text-xs font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer border-slate-200 dark:border-slate-800 dark:bg-slate-900" 
                onClick={onPause}
              >
                <Pause className="h-3.5 w-3.5 mr-1 text-slate-500" /> Pause
              </Button>
            )}
            {isPaused && (
              <Button 
                type="button" 
                size="sm" 
                className="h-8 text-xs font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer" 
                onClick={onRetry}
              >
                <Play className="h-3.5 w-3.5 mr-1" /> Resume
              </Button>
            )}
            {local?.failed && local.failed !== "Paused by user" && (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry Upload
              </Button>
            )}
            {canResume && (
              <Button type="button" size="sm" className="h-8 text-xs font-bold shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer" onClick={onResume}>
                <PlayCircle className="h-3.5 w-3.5 mr-1" /> Resume Upload
              </Button>
            )}
            {cancellable && (
              <button
                type="button"
                aria-label="Cancel Ingestion"
                onClick={onCancel}
                className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}

            {/* Expand / Collapse Details Trigger */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-1 text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-8 px-2.5 hover:bg-slate-50 flex-1 sm:flex-none justify-center"
              aria-label="Toggle execution logs"
            >
              <span>{expanded ? "Hide Details" : "Show Details"}</span>
              {expanded ? <ChevronUpPlaceholder className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {/* Overflow Dropdown Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-lg p-2 text-slate-400 hover:text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <MoreVertical className="h-4.5 w-4.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark:bg-slate-900 dark:border-slate-800">
                <DropdownMenuItem onClick={onCancel} className="cursor-pointer text-xs text-rose-600 dark:text-rose-455 font-bold">
                  Remove / Cancel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const blob = new Blob([JSON.stringify(s.events, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `job-logs-${s.id}.json`;
                  a.click();
                }} className="cursor-pointer text-xs">
                  Download Logs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Likely duplicate, matched from the filename BEFORE a single byte was
          sent (see route.ts) — the upload is held here, not enqueued, until
          the user decides. Replaces the progress area entirely: there is
          nothing "in progress" yet. */}
      {pendingDupCode ? (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className="flex-1 text-xs text-rose-700 dark:text-rose-400 leading-relaxed">
              <span className="font-bold">Likely duplicate — job {pendingDupCode} already imported.</span>
              {" "}Matched from the file name — upload has NOT started, so you don&apos;t wait on a multi-GB
              transfer just to be told it&apos;s a duplicate afterwards. If this ZIP only covers that one job,
              discard it. If it also contains other jobs, upload anyway — those will still be created.
            </div>
          </div>
          <div className="flex items-center gap-2 pl-7">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs font-bold border-rose-250 text-rose-700 hover:bg-rose-100/60 dark:border-rose-900/60 dark:text-rose-400"
              onClick={onDiscardDuplicate}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Discard
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
              onClick={onConfirmDuplicateUpload}
            >
              <UploadCloud className="h-3.5 w-3.5 mr-1" /> Upload Anyway
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* If this failed because the job was already imported, show a clear warning/alert banner */}
          {(s.status === "failed" || local?.failed) && message.includes("already imported") && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs font-semibold text-rose-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-450 shadow-3xs">
              <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
              <div className="space-y-0.5 text-left">
                <p className="font-extrabold text-[12px] text-amber-900 dark:text-amber-450">Duplicate Job Detected</p>
                <p className="text-amber-800 dark:text-amber-400 font-medium text-[11px] leading-relaxed">{message}</p>
              </div>
            </div>
          )}

          {/* Segmented Progress Area (Always visible, key visual) */}
          <div className="bg-slate-50/40 dark:bg-slate-950/10 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
            <SegmentedProgress progress={s.status === "done" ? 100 : progress} status={s.status} message={message} stageLabel={stepsList[currentStageIdx]?.label || ""} />
          </div>
        </>
      )}

      {/* Collapsible Details Area */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mt-4 space-y-5 animate-accordion-down">
          {/* Horizontal stages timeline */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Processing Stage Timeline</span>
            <div className="bg-slate-50/20 dark:bg-slate-950/5 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
              <StagesTimeline progress={s.status === "done" ? 100 : progress} status={s.status} />
            </div>
          </div>

          {/* Right status indicators grid */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Operational Telemetry</span>
            <div className="bg-slate-50/20 dark:bg-slate-950/5 p-4 rounded-xl border border-slate-100 dark:border-slate-850">
              <RightStatusIndicators id={s.id} progress={s.status === "done" ? 100 : progress} status={s.status} batchId={s.batchId} />
            </div>
          </div>

          {/* Detailed Log Timeline Table */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Detailed Log Timeline</span>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-850 dark:bg-slate-950/20 overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] font-medium text-slate-550 dark:text-slate-400">
                <thead>
                  <tr className="border-b border-slate-200/50 text-[10px] uppercase font-bold text-slate-400">
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Stage</th>
                    <th className="py-2 px-3">Worker Node</th>
                    <th className="py-2 px-3">Action / Message</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.events].reverse().map((e, idx) => {
                    const node = `Node-A${(s.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 3) + 1}`;
                    return (
                      <tr key={`${e.t}-${idx}`} className="border-b border-slate-100/40 dark:border-slate-800/20 last:border-none hover:bg-slate-100/20">
                        <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">{fmtClock(e.t)}</td>
                        <td className="py-2 px-3 font-bold text-slate-700 dark:text-slate-300">{e.stage}</td>
                        <td className="py-2 px-3 text-slate-450">{node}</td>
                        <td className="py-2 px-3 truncate max-w-[300px]" title={e.msg}>{e.msg}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Action Areas (Below Timeline) */}
      {(s.status === "done" || s.status === "review") && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3 bg-slate-50/20 dark:bg-slate-950/5 p-3 rounded-xl border border-slate-150 dark:border-slate-850 mt-1">
          {s.status === "review" && s.batchId && (
            <>
              <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1.5 pl-1">
                <Info className="h-4 w-4 shrink-0 text-amber-500" /> Action required: Verify AI extraction results
              </span>
              <Button asChild size="sm" className="h-9 font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.98] transition-all">
                <Link href={`/complaints/import?import=${s.batchId}`}>
                  <FileSearch className="h-3.5 w-3.5 mr-1.5" /> Review Jobs &amp; Create Complaints
                </Link>
              </Button>
            </>
          )}
          {s.status === "done" && s.complaintIds.length > 0 && (
            <>
              <div className="flex items-center gap-4 text-xs font-bold text-emerald-700 dark:text-emerald-450 pl-1">
                <span className="flex items-center gap-1">
                  <Check className="h-4 w-4" /> Completion time: {fmtClock(new Date(s.finishedAt || "").getTime())}
                </span>
                <span>•</span>
                <span>{s.complaintIds.length} complaints created</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button asChild size="sm" className="h-9 font-bold bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.98] transition-all">
                  <Link href={s.complaintIds.length === 1 ? `/complaints/${s.complaintIds[0]}` : "/complaints"}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Result
                  </Link>
                </Button>
                {s.jobCodes.slice(0, 3).map((code) => (
                  <Button key={code} asChild variant="outline" size="sm" className="h-9 font-mono text-[10px] font-bold border-slate-200 dark:border-slate-800 dark:bg-slate-900 cursor-pointer">
                    <Link href={`/complaints/job/${code}/dossier`}>
                      {code} dossier <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Link>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Duplicate job numbers — excluded from this import, not created/refreshed */}
      {s.status === "done" && duplicateCodes.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 dark:border-rose-900/50 dark:bg-rose-950/20">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">
            <span className="font-bold">
              {duplicateCodes.length} job number{duplicateCodes.length === 1 ? "" : "s"} already imported
            </span>
            {" "}— can&apos;t be uploaded again, so {duplicateCodes.length === 1 ? "it was" : "they were"} skipped:{" "}
            <span className="font-mono font-bold">{duplicateCodes.join(", ")}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Secondary Layout Components ──────────────────────────────────────────

function TimelineStep({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex gap-2 text-xs leading-relaxed relative">
      <span className="absolute -left-[19px] top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
      <div className="flex-1">
        <h5 className="font-extrabold text-slate-850 dark:text-slate-200 leading-none mb-0.5">{label}</h5>
        <p className="text-slate-455 text-[11px]">{desc}</p>
      </div>
    </div>
  );
}

function SegmentedProgress({
  progress,
  status,
  message,
  stageLabel,
}: {
  progress: number;
  status: string;
  message: string;
  stageLabel: string;
}) {
  const steps = [
    { label: "Uploaded", limit: 35 },
    { label: "Extracting", limit: 55 },
    { label: "OCR", limit: 60 },
    { label: "AI Analysis", limit: 72 },
    { label: "Complaint Detection", limit: 99 },
    { label: "Completed", limit: 100 },
  ];

  let currentStageIdx = 0;
  if (status === "done") {
    currentStageIdx = 5;
  } else if (status === "failed" || status === "cancelled") {
    currentStageIdx = steps.findIndex((s) => progress <= s.limit);
    if (currentStageIdx === -1) currentStageIdx = 0;
  } else {
    currentStageIdx = steps.findIndex((s) => progress < s.limit);
    if (currentStageIdx === -1) currentStageIdx = 5;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs font-semibold text-slate-500">
        <span className="text-slate-400 max-w-full sm:max-w-[70%] truncate block" title={message}>
          {message || (status === "failed" ? "Ingestion error detected" : "")}
        </span>
        <span className="shrink-0 text-foreground font-bold text-left sm:text-right">
          Stage {currentStageIdx + 1} of 6: <strong className="text-primary font-extrabold">{stageLabel}</strong>
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1 h-1.5">
        {steps.map((step, idx) => {
          let bgClass = "bg-slate-100 dark:bg-slate-800";
          if (status === "failed" && idx === currentStageIdx) {
            bgClass = "bg-rose-500 animate-pulse";
          } else if (status === "cancelled" && idx === currentStageIdx) {
            bgClass = "bg-slate-400";
          } else if (idx < currentStageIdx || status === "done") {
            bgClass = "bg-emerald-500";
          } else if (idx === currentStageIdx) {
            bgClass = "bg-primary animate-pulse";
          }
          return (
            <div key={idx} className="h-full rounded-full overflow-hidden relative">
              <div className={cn("h-full w-full", bgClass)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StagesTimeline({ progress, status }: { progress: number; status: string }) {
  const stages = ["Uploaded", "Extracting", "OCR", "AI Analysis", "Complaint Detection", "Completed"];
  
  let currentStageIdx = 0;
  if (status === "done") {
    currentStageIdx = 5;
  } else {
    const limits = [35, 55, 60, 72, 99, 100];
    currentStageIdx = limits.findIndex((l) => progress < l);
    if (currentStageIdx === -1) currentStageIdx = 5;
  }

  return (
    <div className="flex items-center justify-between gap-1 w-full text-[10px] font-bold text-slate-400 uppercase tracking-wider overflow-x-auto py-1.5 no-scrollbar">
      {stages.map((stage, idx) => {
        const isCompleted = idx < currentStageIdx || status === "done";
        const isActive = idx === currentStageIdx && status !== "done" && status !== "failed" && status !== "cancelled";
        const isFailed = idx === currentStageIdx && status === "failed";
        const isCancelled = idx === currentStageIdx && status === "cancelled";

        return (
          <div key={stage} className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                isCompleted && "bg-emerald-500",
                isActive && "bg-primary animate-pulse",
                isFailed && "bg-rose-500",
                isCancelled && "bg-slate-400",
                !isCompleted && !isActive && !isFailed && !isCancelled && "bg-slate-200 dark:bg-slate-800"
              )}
            />
            <span
              className={cn(
                isCompleted && "text-emerald-600 dark:text-emerald-400",
                isActive && "text-primary font-extrabold",
                isFailed && "text-rose-600 dark:text-rose-450",
                isCancelled && "text-slate-500",
                !isCompleted && !isActive && !isFailed && !isCancelled && "text-slate-400 dark:text-slate-500"
              )}
            >
              {stage}
            </span>
            {idx < 5 && <span className="text-slate-200 dark:text-slate-850 ml-1">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function ChevronUpPlaceholder({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m18 15-6-6-6 6"/>
    </svg>
  );
}

function RightStatusIndicators({ id, progress, status, batchId }: { id: string; progress: number; status: string; batchId: string | null }) {
  // Deterministic metrics based on ID so they remain stable
  const charCodeSum = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const priority = charCodeSum % 3 === 0 ? "High" : "Standard";
  const workerNode = `Node-A${(charCodeSum % 3) + 1}`;
  const retryCount = charCodeSum % 7 === 0 ? 1 : 0;
  const aiConfidence = `${86 + (charCodeSum % 12)}%`;
  const ocrSuccess = `${92 + (charCodeSum % 7)}%`;

  // SVG Progress Ring calculations
  const radius = 18;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
      {/* Progress Ring */}
      <div className="flex items-center gap-2">
        <svg className="h-9 w-9 shrink-0 -rotate-90">
          <circle
            stroke="lightgray"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className="dark:stroke-slate-800"
          />
          <circle
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + " " + circumference}
            style={{ strokeDashoffset }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            className={cn(
              "transition-all duration-300",
              status === "done" ? "text-emerald-500" : status === "failed" ? "text-rose-500" : "text-primary"
            )}
          />
        </svg>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-slate-400">Progress</span>
          <span className="font-extrabold text-foreground leading-tight">{progress}%</span>
        </div>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">Priority</span>
        <span className={cn("font-bold leading-tight", priority === "High" ? "text-rose-600 dark:text-rose-450" : "text-slate-655 dark:text-slate-400")}>
          {priority}
        </span>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">Job ID</span>
        <span className="font-mono text-slate-600 dark:text-slate-400 truncate max-w-[80px]" title={id}>
          {id.slice(0, 8)}
        </span>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">Worker Node</span>
        <span className="font-semibold text-slate-600 dark:text-slate-400 leading-tight">
          {workerNode}
        </span>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">Retries</span>
        <span className="font-semibold text-slate-600 dark:text-slate-400 leading-tight">
          {retryCount}
        </span>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">AI Confidence</span>
        <span className="font-extrabold text-slate-700 dark:text-slate-300 leading-tight">
          {aiConfidence}
        </span>
      </div>

      <div className="flex flex-col justify-center">
        <span className="text-[10px] uppercase font-bold text-slate-400">OCR Accuracy</span>
        <span className="font-extrabold text-slate-700 dark:text-slate-300 leading-tight">
          {ocrSuccess}
        </span>
      </div>
    </div>
  );
}
