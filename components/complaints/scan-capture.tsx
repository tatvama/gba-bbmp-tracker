"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, X, ArrowUp, ArrowDown, FileText, AlertTriangle, CheckCircle2, ExternalLink, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { uploadComplaintScanAction, getDocumentViewUrl } from "@/lib/actions/complaints";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { captureScanFromVideo } from "@/lib/client/scan-enhance";

const selectCls =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface Page {
  id: number;
  file: File;
  url: string | null;
  isPdf: boolean;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Capture-first complaint document upload. On MOBILE the live camera is the
 * hero: high-resolution captures are processed like a scan (auto-levels →
 * paper white, ink black) page by page; every page of the set merges into ONE
 * PDF on the server (sharp normalises again), then OCR + AI summary run. On
 * desktop it's a plain multi-file picker (no camera). After upload the merged
 * PDF is immediately previewable.
 */
export function ScanCapture({
  complaintId,
  docTypes,
  defaultDocType,
  onDone,
}: {
  complaintId: string;
  docTypes: string[];
  defaultDocType?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const idRef = React.useRef(0);
  const [docType, setDocType] = React.useState(defaultDocType ?? docTypes[0] ?? "Other evidence");
  const [title, setTitle] = React.useState("");
  const [docDate, setDocDate] = React.useState(todayLocal());
  const [pages, setPages] = React.useState<Page[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
  const [scanMode, setScanMode] = React.useState(true); // process captures like a scan
  const [flash, setFlash] = React.useState(false);
  const [uploaded, setUploaded] = React.useState<{ documentId: string; pageCount: number; docType: string; firstPageUrl: string | null; aiSummary?: string; ocrStatus?: string } | null>(null);
  const [openingDoc, setOpeningDoc] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const addFiles = React.useCallback((files: File[]) => {
    setError(null);
    const next: Page[] = files.map((file) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      return { id: idRef.current++, file, url: isPdf ? null : URL.createObjectURL(file), isPdf };
    });
    setPages((prev) => [...prev, ...next]);
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }
  function removePage(id: number) {
    setPages((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p?.url) URL.revokeObjectURL(p.url);
      return prev.filter((x) => x.id !== id);
    });
  }
  function move(id: number, dir: -1 | 1) {
    setPages((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      const a = copy[i]; const b = copy[j];
      if (!a || !b) return prev;
      copy[i] = b; copy[j] = a;
      return copy;
    });
  }

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Live camera is not available on this device. Use “Scan / choose files” instead.");
      return;
    }
    try {
      // Ask for the rear camera at the HIGHEST resolution it offers — these
      // captures become legal-document scans, not thumbnails.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError("Could not access the camera. Check permissions or use “Scan / choose files”.");
    }
  }

  async function capturePage() {
    const video = videoRef.current;
    if (!video) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const file = await captureScanFromVideo(video, `page-${pages.length + 1}.jpg`, { enhance: scanMode });
    if (file) addFiles([file]);
  }

  React.useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (pages.length === 0) return;
    stopCamera();
    setBusy(true);
    setError(null);
    setStatusMsg("Merging pages into a PDF…");
    const fd = new FormData();
    fd.set("documentType", docType);
    if (title.trim()) fd.set("title", title.trim());
    if (docDate) fd.set("documentDate", docDate);
    pages.forEach((p) => fd.append("files", p.file));

    const interval = setInterval(() => {
      setStatusMsg((prev) => (prev.includes("Merging") ? "Running OCR…" : prev.includes("OCR") ? "Summarising with AI…" : "Finishing up…"));
    }, 3000);
    try {
      const res = await uploadComplaintScanAction(complaintId, fd);
      clearInterval(interval);
      setBusy(false);
      setStatusMsg("");
      if (!res.ok) {
        setError(res.error ?? "Upload failed");
        return;
      }
      // Success → show the uploaded set (preview stays visible) and refresh
      // the document list behind us. "Scan another" starts the next set.
      const firstPageUrl = pages.find((p) => p.url)?.url ?? null;
      pages.forEach((p) => p.url && p.url !== firstPageUrl && URL.revokeObjectURL(p.url));
      setUploaded({
        documentId: res.documentId ?? "",
        pageCount: pages.length,
        docType,
        firstPageUrl,
        aiSummary: res.aiSummary,
        ocrStatus: res.ocrStatus,
      });
      setPages([]);
      setTitle("");
      router.refresh();
    } catch (e) {
      clearInterval(interval);
      setBusy(false);
      setStatusMsg("");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function openUploadedDoc() {
    if (!uploaded?.documentId) return;
    setOpeningDoc(true);
    try {
      const r = await getDocumentViewUrl(uploaded.documentId);
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else setError(r.error ?? "Could not open the document.");
    } finally {
      setOpeningDoc(false);
    }
  }

  function resetForNextSet() {
    if (uploaded?.firstPageUrl) URL.revokeObjectURL(uploaded.firstPageUrl);
    setUploaded(null);
    setError(null);
  }

  if (busy) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <Spinner size="lg" className="text-primary" />
        <p className="animate-pulse text-sm font-medium">{statusMsg || "Processing…"}</p>
        <p className="text-xs text-muted-foreground">Pages are merged into one optimised PDF, then OCR + AI summary run on the server.</p>
      </div>
    );
  }

  // ── uploaded: preview of the merged set ────────────────────────────────────
  if (uploaded) {
    return (
      <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-950/50">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {uploaded.pageCount} page{uploaded.pageCount === 1 ? "" : "s"} merged into one PDF and uploaded
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
              {uploaded.docType} · {uploaded.ocrStatus === "Completed" ? "OCR + AI summary complete!" : "OCR + AI summary are running in the background."}
            </p>
            {uploaded.aiSummary && (
              <div className="mt-2 text-xs bg-emerald-100/30 text-emerald-900 p-2.5 rounded border border-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-350 dark:border-emerald-900/30">
                <span className="font-semibold block mb-1 text-emerald-850 dark:text-emerald-200">Extracted AI Summary:</span>
                <p className="leading-relaxed">{uploaded.aiSummary}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {uploaded.firstPageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview of the captured first page
            <img src={uploaded.firstPageUrl} alt="First page" className="h-24 w-20 rounded-md border object-cover" />
          )}
          <Button type="button" onClick={openUploadedDoc} disabled={!uploaded.documentId || openingDoc}>
            {openingDoc ? <Spinner size="sm" /> : <ExternalLink className="h-4 w-4" />} View the uploaded PDF
          </Button>
          <Button type="button" variant="outline" onClick={resetForNextSet}>
            <RotateCcw className="h-4 w-4" /> Scan another document
          </Button>
          {onDone && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Done
            </Button>
          )}
        </div>
        <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70">
          It&apos;s in the Documents list below too — the preview opens the exact merged PDF that was stored.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Document type</Label>
          <select className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
            {docTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Title (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ack receipt 29-Jun" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Document date</Label>
          <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="h-11" />
        </div>
      </div>

      {cameraOn ? (
        <div className="space-y-3 rounded-xl border bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-lg">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio */}
            <video ref={videoRef} playsInline muted className="mx-auto max-h-[26rem] w-full bg-black object-contain" />
            {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}
            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white tabular-nums">
              {pages.length} page{pages.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => setScanMode((v) => !v)}
              className={`absolute right-2 top-2 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                scanMode ? "bg-primary text-primary-foreground" : "bg-black/60 text-white/80"
              }`}
              title="Process captures like a scanned document (auto-contrast, paper white)"
            >
              <Sparkles className="h-3 w-3" /> Scan mode {scanMode ? "ON" : "OFF"}
            </button>
          </div>
          <div className="flex items-center justify-center gap-6 pb-1">
            <Button type="button" variant="outline" className="h-10 border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={stopCamera}>
              Done capturing
            </Button>
            <button
              type="button"
              onClick={() => void capturePage()}
              aria-label="Capture page"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 transition-transform active:scale-90"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
            <span className="w-[7.5rem] text-center text-[11px] text-white/60">
              High-res capture, processed {scanMode ? "as a scan" : "as-is"}
            </span>
          </div>
        </div>
      ) : (
        <div className={`grid gap-2 ${isMobile ? "sm:grid-cols-2" : ""}`}>
          {/* Live camera is a MOBILE feature — desktops rarely have a usable
              document camera, so there we only offer the file picker. */}
          {isMobile && (
            <button
              type="button"
              onClick={startCamera}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-primary/50 bg-primary/5 py-5 text-center transition-colors hover:bg-primary/10 active:scale-[0.99]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
                <Camera className="h-6 w-6 text-primary" />
              </span>
              <span className="text-sm font-bold text-primary">Open the camera</span>
              <span className="text-[11px] text-muted-foreground">Click each page — they merge into one PDF</span>
            </button>
          )}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-5 text-center hover:bg-primary/10">
            <span className="flex items-center gap-2 text-sm font-medium text-primary"><Upload className="h-5 w-5" /> Scan / choose files</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or PDF · multiple allowed</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              {...(isMobile ? { capture: "environment" as const } : {})}
              multiple
              className="hidden"
              onChange={onPick}
            />
          </label>
        </div>
      )}

      {error && <p className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> {error}</p>}

      {pages.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{pages.length} page{pages.length > 1 ? "s" : ""} · merged into one PDF in this order.</p>
          <div className="flex flex-wrap gap-2">
            {pages.map((p, i) => (
              <div key={p.id} className="relative w-24 overflow-hidden rounded-md border bg-muted">
                <div className="flex h-24 items-center justify-center">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview
                    <img src={p.url} alt={`Page ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-[10px] text-muted-foreground"><FileText className="h-6 w-6" /> PDF</div>
                  )}
                </div>
                <div className="flex items-center justify-between bg-background/90 px-1 py-0.5">
                  <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" aria-label="Move left" onClick={() => move(p.id, -1)} className="rounded p-0.5 hover:bg-muted"><ArrowUp className="h-3 w-3 -rotate-90" /></button>
                    <button type="button" aria-label="Move right" onClick={() => move(p.id, 1)} className="rounded p-0.5 hover:bg-muted"><ArrowDown className="h-3 w-3 -rotate-90" /></button>
                    <button type="button" aria-label="Remove page" onClick={() => removePage(p.id)} className="rounded p-0.5 text-destructive hover:bg-muted"><X className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={submit} disabled={pages.length === 0}><Upload className="h-4 w-4" /> Upload &amp; OCR ({pages.length})</Button>
        {onDone && <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>}
      </div>
    </div>
  );
}
