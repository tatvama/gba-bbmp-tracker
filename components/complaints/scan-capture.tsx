"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, X, ArrowUp, ArrowDown, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { uploadComplaintScanAction } from "@/lib/actions/complaints";

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
 * Capture-first complaint document upload: live-camera photos and/or a scanned PDF,
 * merged into one optimised PDF on the server (sharp normalises photos like a scan),
 * then OCR + AI summary. Mirrors the RTI document-capture UX.
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
  const idRef = React.useRef(0);
  const [docType, setDocType] = React.useState(defaultDocType ?? docTypes[0] ?? "Other evidence");
  const [title, setTitle] = React.useState("");
  const [docDate, setDocDate] = React.useState(todayLocal());
  const [pages, setPages] = React.useState<Page[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [statusMsg, setStatusMsg] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
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

  function capturePage() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      addFiles([new File([blob], `page-${pages.length + 1}.jpg`, { type: "image/jpeg" })]);
    }, "image/jpeg", 0.9);
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
      pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      setPages([]);
      setTitle("");
      onDone?.();
      router.refresh();
    } catch (e) {
      clearInterval(interval);
      setBusy(false);
      setStatusMsg("");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
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
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio */}
          <video ref={videoRef} playsInline muted className="mx-auto max-h-80 w-full rounded-lg bg-black object-contain" />
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={capturePage}><Camera className="h-4 w-4" /> Capture page</Button>
            <Button type="button" variant="outline" onClick={stopCamera}>Done capturing</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" className="h-auto py-4" onClick={startCamera}>
            <Camera className="h-5 w-5" /> Use live camera
          </Button>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-center hover:bg-primary/10">
            <span className="flex items-center gap-2 text-sm font-medium text-primary"><Upload className="h-5 w-5" /> Scan / choose files</span>
            <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or PDF · multiple allowed</span>
            <input type="file" accept="image/*,application/pdf" capture="environment" multiple className="hidden" onChange={onPick} />
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
