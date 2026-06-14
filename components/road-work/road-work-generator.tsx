"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText, AlertTriangle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AiDraftPanel } from "@/components/rti/ai-draft-panel";
import { generateRoadWorkLetter, saveAiDraft } from "@/lib/actions/ai";
import { createRti } from "@/lib/actions/rti";
import { createComplaint } from "@/lib/actions/complaints";
import type { RoadWorkLanguage, RoadWorkOutputType } from "@/lib/ai/road-work-knowledge";

interface WardOption { id: string; new_no: number; new_name: string }
interface FormOptions { wards: WardOption[] }

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function RoadWorkGenerator({
  outputType,
  options,
  aiConfigured,
}: {
  outputType: RoadWorkOutputType;
  options: FormOptions;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const isRti = outputType === "rti";

  const [mode, setMode] = React.useState<"summary" | "upload">("summary");
  const [summary, setSummary] = React.useState("");
  const [workOrderExtract, setWorkOrderExtract] = React.useState("");
  const [wardId, setWardId] = React.useState("");
  const [jobNumber, setJobNumber] = React.useState("");
  const [roadName, setRoadName] = React.useState("");
  const [contractor, setContractor] = React.useState("");
  const [language, setLanguage] = React.useState<RoadWorkLanguage>("English");
  const [includeAll, setIncludeAll] = React.useState(false);

  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadMsg, setUploadMsg] = React.useState<string | null>(null);
  const [uploadErr, setUploadErr] = React.useState<string | null>(null);

  const wardName = React.useMemo(() => {
    const w = options.wards.find((x) => x.id === wardId);
    return w ? `${w.new_no} — ${w.new_name}` : null;
  }, [wardId, options.wards]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    setUploadErr(null);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/ocr/extract", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setUploadErr(json.error ?? "OCR failed.");
        return;
      }
      setWorkOrderExtract(json.ocrText ?? "");
      const ex = json.extraction ?? {};
      if (ex.jobNumber) setJobNumber(ex.jobNumber);
      if (ex.roadName) setRoadName(ex.roadName);
      if (ex.contractorName) setContractor(ex.contractorName);
      if (ex.summary && !summary) setSummary(ex.summary);
      // Match ward number to a ward option.
      if (ex.wardNumber) {
        const n = parseInt(String(ex.wardNumber).replace(/\D/g, ""), 10);
        const w = options.wards.find((x) => x.new_no === n);
        if (w) setWardId(w.id);
      }
      setUploadMsg(
        json.extractionOk
          ? "Work order read — details prefilled below. Review and edit as needed."
          : json.aiConfigured
            ? "OCR done, but AI extraction was uncertain — fill the details manually."
            : "OCR done. AI extraction is off (no API key) — fill details manually.",
      );
    } catch {
      setUploadErr("Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  function buildFacts() {
    return {
      outputType,
      language,
      summary: summary || null,
      workOrderExtract: workOrderExtract || null,
      wardName,
      jobNumber: jobNumber || null,
      roadName: roadName || null,
      contractor: contractor || null,
      scope: (includeAll ? "all" : "smart") as "all" | "smart",
    };
  }

  async function onApprove(finalText: string) {
    const subjectBase = roadName || wardName || "BBMP road work";
    const ref = jobNumber ? ` (${jobNumber})` : "";

    if (isRti) {
      const fd = new FormData();
      fd.set("subject", `Road work RTI — ${subjectBase}${ref}`);
      fd.set("infoRequested", finalText);
      fd.set("category", "Road work");
      fd.set("status", "Draft");
      fd.set("priority", "Medium");
      if (wardId) fd.set("wardId", wardId);
      if (workOrderExtract) fd.set("internalNotes", `Work order OCR:\n${workOrderExtract}`.slice(0, 5000));
      const r = await createRti({}, fd);
      if (!r.success || !r.id) return { ok: false, error: r.error ?? "Could not create RTI." };
      await saveAiDraft({ entityType: "rti", entityId: r.id, kind: "road_work_rti", content: finalText, language });
      router.push(`/rti/${r.id}`);
      return { ok: true, id: r.id };
    }

    // Complaint
    const fd = new FormData();
    fd.set("title", `Road work — ${subjectBase}${ref}`);
    fd.set("type", "Road");
    fd.set("status", "Draft");
    fd.set("priority", "Medium");
    fd.set("description", finalText);
    if (wardId) fd.set("wardId", wardId);
    if (roadName) fd.set("locationText", roadName);
    if (jobNumber) fd.set("requestedAction", `Inquiry into road work ${jobNumber}`);
    const r = await createComplaint({}, fd);
    if (!r.success || !r.id) return { ok: false, error: r.error ?? "Could not create complaint." };
    await saveAiDraft({ entityType: "complaint", entityId: r.id, kind: "road_work_complaint", content: finalText, language });
    // Attach the uploaded work order to the new complaint (best-effort).
    if (file) {
      try {
        const ufd = new FormData();
        ufd.append("file", file);
        ufd.append("documentType", "Work order");
        ufd.append("title", "Work order");
        await fetch(`/api/complaints/${r.id}/documents/upload`, { method: "POST", body: ufd });
      } catch {
        /* non-fatal */
      }
    }
    router.push(`/complaints/${r.id}`);
    return { ok: true, id: r.id };
  }

  return (
    <div className="space-y-5">
      {/* Input mode toggle */}
      <div className="inline-flex rounded-lg border bg-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("summary")}
          className={`rounded-md px-3 py-1.5 font-medium ${mode === "summary" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <FileText className="mr-1 inline h-4 w-4" /> Type a summary
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`rounded-md px-3 py-1.5 font-medium ${mode === "upload" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <Upload className="mr-1 inline h-4 w-4" /> Upload work order
        </button>
      </div>

      {mode === "upload" && (
        <div className="rounded-xl border bg-card p-4">
          <Label htmlFor="wo-file" className="mb-1.5 block text-sm font-medium">
            Work order / estimate / agreement (JPG, PNG, WebP or PDF)
          </Label>
          <div className="flex items-center gap-3">
            <Input id="wo-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} disabled={uploading} className="max-w-sm" />
            {uploading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {uploadMsg && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-teal">
              <ScanLine className="h-3.5 w-3.5" /> {uploadMsg}
            </p>
          )}
          {uploadErr && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {uploadErr}
            </p>
          )}
        </div>
      )}

      {/* Work details */}
      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="summary" className="mb-1.5 block text-sm font-medium">
            Short summary of the issue {mode === "summary" && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="e.g. BC overlay done on this road last month; 3 follow-ups, no quality test shared; suspect short thickness and no royalty paid."
          />
        </div>
        <div>
          <Label htmlFor="ward" className="mb-1.5 block text-sm font-medium">Ward</Label>
          <select id="ward" className={selectCls} value={wardId} onChange={(e) => setWardId(e.target.value)}>
            <option value="">— Select ward —</option>
            {options.wards.map((w) => (
              <option key={w.id} value={w.id}>{w.new_no} — {w.new_name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="job" className="mb-1.5 block text-sm font-medium">Work / job number</Label>
          <Input id="job" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} placeholder="e.g. RR-2026-0456" />
        </div>
        <div>
          <Label htmlFor="road" className="mb-1.5 block text-sm font-medium">Road / location</Label>
          <Input id="road" value={roadName} onChange={(e) => setRoadName(e.target.value)} placeholder="e.g. 5th Cross, XYZ Layout" />
        </div>
        <div>
          <Label htmlFor="contractor" className="mb-1.5 block text-sm font-medium">Contractor (if known)</Label>
          <Input id="contractor" value={contractor} onChange={(e) => setContractor(e.target.value)} placeholder="optional" />
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Language:</span>
          <div className="inline-flex rounded-md border bg-muted p-0.5 text-sm">
            {(["English", "Kannada"] as RoadWorkLanguage[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={`rounded px-3 py-1 ${language === l ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
              >
                {l === "Kannada" ? "ಕನ್ನಡ" : "English"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} className="h-4 w-4 rounded border-input" />
          Include all inspection points (full 60-point check)
        </label>
      </div>

      {/* AI draft + review + approve */}
      <AiDraftPanel
        aiConfigured={aiConfigured}
        generate={() => generateRoadWorkLetter(buildFacts())}
        kind={isRti ? "road_work_rti" : "road_work_complaint"}
        language={language}
        onApprove={onApprove}
        approveLabel={isRti ? "Approve & Create RTI" : "Approve & Create Complaint"}
        inputs={
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Will draft a {isRti ? "Road Work RTI application" : "Road Work complaint"}</p>
            <ul className="mt-1 space-y-0.5">
              <li>Ward: {wardName ?? "—"}</li>
              <li>Job no.: {jobNumber || "—"}</li>
              <li>Road: {roadName || "—"}</li>
              <li>Language: {language}</li>
              <li>Scope: {includeAll ? "all 60 points" : "relevant points"}</li>
            </ul>
          </div>
        }
      />
    </div>
  );
}
