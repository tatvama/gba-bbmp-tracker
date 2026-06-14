"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, Loader2, ImagePlus, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPLAINT_DOCUMENT_TYPES } from "@/lib/constants";

const selectCls =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface UploadOutcome {
  fileName: string;
  ok: boolean;
  ocrStatus?: string;
  error?: string;
}

export function DocumentUpload({
  complaintId,
  aiConfigured,
}: {
  complaintId: string;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = React.useState<File[]>([]);
  const [documentType, setDocumentType] = React.useState<string>("Original complaint copy");
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<UploadOutcome[]>([]);

  const previews = React.useMemo(
    () => files.map((f) => ({ name: f.name, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })),
    [files],
  );
  React.useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setResults([]);
  }

  async function upload(opts: { runOcr: boolean; asEvidence: boolean }) {
    if (files.length === 0) return;
    setBusy(true);
    const out: UploadOutcome[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("documentType", opts.asEvidence ? (documentType.startsWith("Site photo") ? documentType : "Site photo before work") : documentType);
      if (title) fd.set("title", title);
      fd.set("runOcr", String(opts.runOcr));
      fd.set("asEvidence", String(opts.asEvidence));
      try {
        const res = await fetch(`/api/complaints/${complaintId}/documents/upload`, { method: "POST", body: fd });
        const json = await res.json();
        out.push({ fileName: file.name, ok: res.ok && json.ok, ocrStatus: json.ocrStatus, error: json.error });
      } catch (e) {
        out.push({ fileName: file.name, ok: false, error: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    setResults(out);
    setFiles([]);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Document type</Label>
          <select className={selectCls} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {COMPLAINT_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Title (optional)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AEE reply 12-Jun" className="h-11" />
        </div>
      </div>

      {/* Big capture button (mobile rear camera) */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center hover:bg-primary/10">
        <Camera className="h-8 w-8 text-primary" />
        <span className="text-sm font-semibold text-primary">Capture paper photo / choose files</span>
        <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or PDF · multiple allowed</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </label>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((p, i) => (
            <div key={i} className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted text-[10px]">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview; next/image can't optimise blob: URLs
                <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <span className="px-1 text-center">{p.name}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => upload({ runOcr: true, asEvidence: false })} disabled={busy || files.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload &amp; run OCR
        </Button>
        <Button variant="outline" onClick={() => upload({ runOcr: false, asEvidence: false })} disabled={busy || files.length === 0}>
          <Upload className="h-4 w-4" /> Upload without OCR
        </Button>
        <Button variant="outline" onClick={() => upload({ runOcr: false, asEvidence: true })} disabled={busy || files.length === 0}>
          <ImagePlus className="h-4 w-4" /> Add as evidence photo
        </Button>
      </div>

      {!aiConfigured && (
        <p className="text-xs text-muted-foreground">
          <AlertTriangle className="mr-1 inline h-3 w-3" /> AI summary is off (no key) — OCR still runs; you can summarise manually.
        </p>
      )}

      {results.length > 0 && (
        <ul className="space-y-1 text-sm">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-teal" : "text-destructive"}>
              {r.ok ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
              {r.fileName} — {r.ok ? `uploaded (OCR: ${r.ocrStatus})` : r.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
