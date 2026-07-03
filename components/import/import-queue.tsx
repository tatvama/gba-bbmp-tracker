"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud, FolderArchive, X, CheckCircle2, AlertTriangle, Loader2, Clock,
  RefreshCw, PlayCircle, FileSearch, Wifi, WifiOff, ExternalLink, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  IMPORT_CHUNK_SIZE, fileFingerprint,
  type ImportEventsPayload, type ImportUploadSnapshot,
} from "@/lib/import-queue/types";
import { saveFileHandle, loadFileHandle, deleteFileHandle, fileFromHandle } from "@/lib/client/import-idb";

/**
 * The forensic-ZIP import queue: drop several 0.6–1.6 GB ZIPs, they upload
 * ONE AT A TIME in 8 MB chunks with live speed/ETA, then the server queue
 * extracts → analyzes → creates complaints while an SSE stream pushes stage +
 * percent updates onto each card. Close the browser mid-way and everything
 * resumes: server work continues on its own; interrupted uploads continue
 * from the last byte via an IndexedDB file handle (or by re-selecting the
 * same file — matched by fingerprint).
 */

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
  uploading: { label: "Uploading", chip: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  queued: { label: "In queue", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  processing: { label: "Processing", chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  review: { label: "Ready for review", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  done: { label: "Done", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  failed: { label: "Failed", chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  cancelled: { label: "Cancelled", chip: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

export function ImportQueue({ presetFiles }: { presetFiles?: File[] } = {}) {
  const [sessions, setSessions] = React.useState<ImportUploadSnapshot[]>([]);
  const [local, setLocal] = React.useState<Record<string, LocalUpload>>({});
  const [resumable, setResumable] = React.useState<Record<string, FileSystemFileHandle>>({});
  const [autoCommit, setAutoCommit] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [live, setLive] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

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
      es.onerror = () => setLive(false); // EventSource auto-reconnects
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
            return { stopped: true }; // session moved on (another tab finished it / cancelled)
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
      if (!zips.length) {
        setError("Only .zip files go through the import queue.");
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
          const d = (await r.json()) as { session?: ImportUploadSnapshot; resumed?: boolean; error?: string };
          if (!r.ok || !d.session) {
            setError(d.error || `Could not start the upload for ${file.name}.`);
            continue;
          }
          const s = d.session;
          setSessions((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
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
    [autoCommit, enqueueUpload],
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
          types: [{ description: "ZIP archives", accept: { "application/zip": [".zip"] } }],
          excludeAcceptAllOption: false,
        });
        const files = await Promise.all(handles.map((h) => h.getFile()));
        await addFiles(files, handles);
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // user closed the picker
      }
    }
    document.getElementById("import-queue-file-input")?.click();
  }, [addFiles]);

  // ── derived view state ──────────────────────────────────────────────────────
  const ordered = React.useMemo(() => {
    const rank = (s: ImportUploadSnapshot) => (ACTIVE_STATUSES.has(s.status) ? 0 : 1);
    return [...sessions].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  }, [sessions]);
  const queuedIds = React.useMemo(
    () => ordered.filter((s) => s.status === "queued").map((s) => s.id),
    [ordered],
  );
  const resumableSessions = ordered.filter((s) => s.status === "uploading" && resumable[s.id] && !local[s.id]);
  const activeCount = ordered.filter((s) => ACTIVE_STATUSES.has(s.status)).length;

  return (
    <div className="space-y-4">
      {/* ── dropzone ── */}
      <Card className="border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-6 space-y-4">
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-rose-200/60 bg-rose-50/40 p-3 text-sm text-rose-600 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}

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
            className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-all ${
              dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-slate-200 bg-slate-50/40 hover:border-primary/50 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30 dark:hover:bg-slate-900/50"
            }`}
          >
            <div className="rounded-2xl bg-primary/10 p-3 transition-transform group-hover:-translate-y-0.5">
              <UploadCloud className="h-8 w-8 text-primary" />
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Drop forensic ZIPs here — or click to browse
            </span>
            <span className="text-xs text-slate-400 max-w-md">
              Several files welcome (up to 4 GB each). They upload one by one; leave the page any time — the import
              carries on and resumes right here.
            </span>
            <input
              id="import-queue-file-input"
              type="file"
              accept=".zip,application/zip"
              multiple
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCommit}
                onChange={(e) => setAutoCommit(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Create the complaints automatically after analysis (untick to review each job first)
            </label>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              {live ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-amber-500" />}
              {live ? "Live updates connected" : "Reconnecting…"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── resume banner ── */}
      <AnimatePresence>
        {resumableSessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"
          >
            <PlayCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-300">
              <span className="font-semibold">
                {resumableSessions.length} interrupted upload{resumableSessions.length === 1 ? "" : "s"}
              </span>{" "}
              from your last visit can continue where they left off.
            </div>
            {resumableSessions.map((s) => (
              <Button key={s.id} type="button" size="sm" className="h-8" onClick={() => void resumeFromHandle(s)}>
                <PlayCircle className="h-3.5 w-3.5 mr-1" /> Resume {s.fileName}
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── queue cards ── */}
      {ordered.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Import queue {activeCount ? `· ${activeCount} active` : ""}
          </p>
          <AnimatePresence initial={false}>
            {ordered.map((s) => (
              <QueueCard
                key={s.id}
                session={s}
                local={local[s.id]}
                queuePos={s.status === "queued" ? queuedIds.indexOf(s.id) + 1 : 0}
                canResume={Boolean(resumable[s.id]) && !local[s.id]}
                onResume={() => void resumeFromHandle(s)}
                onCancel={() => void cancelSession(s.id)}
                onRetry={() => retryUpload(s)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function QueueCard({
  session: s,
  local,
  queuePos,
  canResume,
  onResume,
  onCancel,
  onRetry,
}: {
  session: ImportUploadSnapshot;
  local?: LocalUpload;
  queuePos: number;
  canResume: boolean;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const meta = STATUS_META[s.status] ?? STATUS_META.queued!;
  const uploadingLocally = Boolean(local) && s.status === "uploading" && !local?.failed;
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${
        working
          ? "border-primary/40 dark:border-primary/30"
          : s.status === "failed"
            ? "border-rose-200 dark:border-rose-900/50"
            : "border-slate-200 dark:border-slate-800"
      }`}
    >
      {working && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-progress-slide rounded-full bg-primary/60" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <div className={`rounded-lg p-2 ${s.status === "done" ? "bg-emerald-100 dark:bg-emerald-950/40" : s.status === "failed" ? "bg-rose-100 dark:bg-rose-950/40" : "bg-primary/10"}`}>
          {s.status === "done" ? (
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
          ) : s.status === "failed" ? (
            <AlertTriangle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
          ) : working ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin text-primary" />
          ) : s.status === "review" ? (
            <FileSearch className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <FolderArchive className="h-4.5 w-4.5 text-primary" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{s.fileName}</p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            {fmtMB(s.fileSize)}
            {s.jobCodes.length > 0 && <> · {s.jobCodes.length} job{s.jobCodes.length === 1 ? "" : "s"}: <span className="font-mono">{s.jobCodes.slice(0, 4).join(", ")}{s.jobCodes.length > 4 ? "…" : ""}</span></>}
          </p>
        </div>

        {queuePos > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Clock className="h-3 w-3" /> #{queuePos} in queue
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>

        {local?.failed && (
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        )}
        {canResume && (
          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={onResume}>
            <PlayCircle className="h-3 w-3 mr-1" /> Resume
          </Button>
        )}
        {cancellable && (
          <button
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <Progress
          value={s.status === "done" ? 100 : progress}
          barClassName={s.status === "done" ? "bg-emerald-500" : s.status === "failed" ? "bg-rose-500" : undefined}
        />
        <div className="flex items-center justify-between gap-3">
          <p className={`min-w-0 flex-1 truncate text-[11px] ${local?.failed || s.status === "failed" ? "text-rose-500" : "text-slate-500 dark:text-slate-400"}`}>
            {s.status === "failed" ? s.error || message : message}
          </p>
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500 dark:text-slate-400">
            {s.status === "done" ? "100" : progress}%
          </span>
        </div>
      </div>

      {/* result / review actions */}
      {(s.status === "done" || s.status === "review") && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {s.status === "review" && s.batchId && (
            <Link
              href={`/complaints/import?import=${s.batchId}`}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-500"
            >
              <FileSearch className="h-3.5 w-3.5" /> Review jobs &amp; create complaints
            </Link>
          )}
          {s.status === "done" && s.complaintIds.length > 0 && (
            <>
              <Link
                href={s.complaintIds.length === 1 ? `/complaints/${s.complaintIds[0]}` : "/complaints"}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {s.complaintIds.length === 1 ? "Open the complaint" : `View ${s.complaintIds.length} complaints`}
              </Link>
              {s.jobCodes.slice(0, 3).map((code) => (
                <Link
                  key={code}
                  href={`/complaints/job/${code}/dossier`}
                  className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-600 transition-colors hover:border-primary/40 hover:text-primary dark:border-slate-700 dark:text-slate-300"
                >
                  {code} dossier <ChevronRight className="h-3 w-3" />
                </Link>
              ))}
            </>
          )}
        </div>
      )}

      {/* activity log */}
      {s.events.length > 0 && (
        <details className="mt-2.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            Activity
          </summary>
          <ul className="mt-1.5 space-y-0.5 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
            {[...s.events].reverse().map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="shrink-0 font-mono text-slate-400">{fmtClock(e.t)}</span>
                <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">{e.stage}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-500">{e.msg}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </motion.div>
  );
}
