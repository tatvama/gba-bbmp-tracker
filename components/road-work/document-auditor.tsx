"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiDraftPanel } from "@/components/rti/ai-draft-panel";
import { generateRoadWorkLetter, saveAiDraft } from "@/lib/actions/ai";
import { createComplaint } from "@/lib/actions/complaints";
import type { RoadWorkFinding, RoadWorkAudit } from "@/lib/ai/road-work-analyzer";

interface WardOption { id: string; new_no: number; new_name: string }

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

function sev(s: RoadWorkFinding["severity"]): "destructive" | "warning" | "muted" {
  return s === "High" ? "destructive" : s === "Medium" ? "warning" : "muted";
}

export function DocumentAuditor({
  options,
  aiConfigured,
}: {
  options: { wards: WardOption[] };
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [docType, setDocType] = React.useState("Bill");
  const [wardId, setWardId] = React.useState("");
  const [audit, setAudit] = React.useState<RoadWorkAudit | null>(null);
  const [ocrText, setOcrText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setBusy(true);
    setError(null);
    setAudit(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("documentType", docType);
      const res = await fetch("/api/road-work/analyze-bill", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Audit failed.");
        return;
      }
      setOcrText(json.ocrText ?? "");
      setAudit(json.audit ?? null);
      if (!json.auditOk && json.audit?.summary) setError(json.audit.summary);
    } catch {
      setError("Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  const findingsText = React.useMemo(() => {
    if (!audit) return "";
    return audit.findings
      .map((f) => `[${f.severity}] ${f.section}: ${f.title} — ${f.detail}`)
      .join("\n");
  }, [audit]);

  const wardName = React.useMemo(() => {
    const w = options.wards.find((x) => x.id === wardId);
    return w ? `${w.new_no} — ${w.new_name}` : null;
  }, [wardId, options.wards]);

  async function onApprove(finalText: string) {
    const fd = new FormData();
    fd.set("title", `Road work irregularities${wardName ? ` — ${wardName}` : ""} (${docType} audit)`);
    fd.set("type", "Road");
    fd.set("status", "Draft");
    fd.set("priority", "High");
    fd.set("description", finalText);
    if (wardId) fd.set("wardId", wardId);
    const r = await createComplaint({}, fd);
    if (!r.success || !r.id) return { ok: false, error: r.error ?? "Could not create complaint." };
    await saveAiDraft({ entityType: "complaint", entityId: r.id, kind: "road_work_audit_complaint", content: finalText });
    if (file) {
      try {
        const ufd = new FormData();
        ufd.append("file", file);
        ufd.append("documentType", docType);
        ufd.append("title", `${docType} (audited)`);
        await fetch(`/api/complaints/${r.id}/documents/upload`, { method: "POST", body: ufd });
      } catch { /* non-fatal */ }
    }
    router.push(`/complaints/${r.id}`);
    return { ok: true, id: r.id };
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="docType" className="mb-1.5 block text-sm font-medium">Document type</Label>
          <select id="docType" className={selectCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
            {["Bill", "MB Book", "Estimate", "Measurement sheet", "Work order"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ward" className="mb-1.5 block text-sm font-medium">Ward (optional)</Label>
          <select id="ward" className={selectCls} value={wardId} onChange={(e) => setWardId(e.target.value)}>
            <option value="">— Select ward —</option>
            {options.wards.map((w) => <option key={w.id} value={w.id}>{w.new_no} — {w.new_name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="file" className="mb-1.5 block text-sm font-medium">Upload (JPG/PNG/WebP/PDF)</Label>
          <div className="flex items-center gap-2">
            <Input id="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFile} disabled={busy} />
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </div>

      {!aiConfigured && (
        <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs text-amber-dark">
          <AlertTriangle className="mb-1 h-4 w-4" /> <span className="font-semibold">AI not configured.</span> Set ANTHROPIC_API_KEY to enable the red-flag audit.
        </div>
      )}
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}

      {audit && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Audit findings</CardTitle>
              {audit.redFlagCount > 0 ? (
                <Badge variant="destructive"><ShieldAlert className="h-3 w-3" /> {audit.redFlagCount} red flag{audit.redFlagCount === 1 ? "" : "s"}</Badge>
              ) : (
                <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> No obvious red flags</Badge>
              )}
            </CardHeader>
            <CardContent>
              {audit.summary && <p className="mb-3 text-sm text-muted-foreground">{audit.summary}</p>}
              {audit.needsManualReview && (
                <p className="mb-3 rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-amber-dark">
                  Low confidence / OCR unclear — verify against the original document before acting.
                </p>
              )}
              {audit.findings.length > 0 ? (
                <div className="space-y-2">
                  {audit.findings.map((f, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={sev(f.severity)}>{f.severity}</Badge>
                        <span className="font-semibold text-sm">{f.title}</span>
                        <span className="text-xs text-muted-foreground">· {f.section}</span>
                      </div>
                      <p className="mt-1 text-sm">{f.detail}</p>
                      {f.evidence && <p className="mt-1 text-xs italic text-muted-foreground">“{f.evidence}”</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No specific red flags extracted from this document.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Draft a complaint from these findings</CardTitle></CardHeader>
            <CardContent>
              <AiDraftPanel
                aiConfigured={aiConfigured}
                kind="road_work_audit_complaint"
                onApprove={onApprove}
                approveLabel="Approve & Create Complaint"
                generate={() =>
                  generateRoadWorkLetter({
                    outputType: "complaint",
                    language: "English",
                    summary: `Audit of a ${docType}${wardName ? ` for ward ${wardName}` : ""} surfaced the following apparent irregularities:\n${findingsText}`,
                    workOrderExtract: ocrText || null,
                    wardName,
                    scope: "smart",
                  })
                }
                inputs={
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">{audit.findings.length} finding(s) → complaint</p>
                    <p className="mt-1">Ward: {wardName ?? "—"} · Doc: {docType}</p>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
