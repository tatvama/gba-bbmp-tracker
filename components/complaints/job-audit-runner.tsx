"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ShieldAlert, ShieldCheck, FileWarning, ScrollText, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runJobAuditAction, type JobAuditResult } from "@/lib/actions/job-audit";
import type { JobAuditReport } from "@/lib/forensics/job-audit";

const money = (n: number | null | undefined) =>
  typeof n === "number" && n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—";

function bandStyle(band: string): { variant: "destructive" | "warning" | "muted" | "success"; label: string } {
  switch (band) {
    case "bill_stop": return { variant: "destructive", label: "Bill-stop level" };
    case "serious": return { variant: "destructive", label: "Serious" };
    case "procedural": return { variant: "warning", label: "Procedural" };
    default: return { variant: "muted", label: "Low" };
  }
}
function sev(s: string): "destructive" | "warning" | "muted" {
  return s === "High" ? "destructive" : s === "Medium" ? "warning" : "muted";
}

export function JobAuditRunner({
  jobNumber, initialReport, initialMeta, aiConfigured,
}: {
  jobNumber: string;
  initialReport: JobAuditReport | null;
  initialMeta?: { docCount?: number; createdAt?: string | null } | null;
  aiConfigured: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [res, setRes] = React.useState<JobAuditResult | null>(initialReport ? { ok: true, report: initialReport, docCount: initialMeta?.docCount } : null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await runJobAuditAction(jobNumber);
      if (!r.ok) setError(r.error ?? "Audit failed.");
      setRes(r);
    } finally {
      setBusy(false);
    }
  }

  const report = res?.report ?? null;
  const band = report ? bandStyle(report.risk.band) : null;
  const ranked = report?.rankedFindings ?? [];
  const coverage = report?.coverage ?? res?.coverage ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
          {report ? "Re-run forensic audit" : "Run forensic audit"}
        </Button>
        {report && (
          <Button asChild variant="outline">
            <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/letter`}><ScrollText className="h-4 w-4" /> Draft letter from findings</Link>
          </Button>
        )}
        {!aiConfigured && (
          <span className="text-xs text-amber-dark">AI not configured — extraction is limited; deterministic checks still run.</span>
        )}
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}

      {report && band && (
        <>
          {/* Risk dashboard */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5" /> Job {jobNumber} — risk assessment</CardTitle>
              <Badge variant={band.variant} className="text-sm">{band.label} · {report.risk.score}/100</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Findings" value={String(report.counts.findings)} />
                <Stat label="Red flags" value={String(report.counts.redFlags)} accent={report.counts.redFlags > 0} />
                <Stat label="Possible exposure" value={money(report.loss.totalPossibleExposure)} accent={report.loss.totalPossibleExposure > 0} />
                <Stat
                  label="Documents extracted"
                  value={coverage ? `${coverage.documentsExtracted} / ${coverage.documentsExtractable}` : String(res?.docCount ?? "—")}
                  accent={Boolean(coverage?.capped)}
                />
              </div>
              {coverage?.capped && (
                <div className="mt-3 rounded-md border border-amber/50 bg-amber/10 p-2 text-xs text-amber-dark">
                  ⚠ Partial audit — only {coverage.documentsExtracted} of {coverage.documentsExtractable} readable documents were AI-extracted (cap to bound cost). The risk band reflects the extracted subset only; do not treat a low band as a clean bill until the rest are reviewed.
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Findings are documented suspicions requiring records and explanation — not findings of guilt. Exposure figures are possible amounts requiring verification, not proven loss.
              </p>
            </CardContent>
          </Card>

          {/* Document matrix */}
          {report.documentMatrix.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Document control matrix</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {report.documentMatrix.map((d, i) => (
                    <Badge key={i} variant={d.present ? "success" : "muted"}>
                      {d.present ? <ShieldCheck className="h-3 w-3" /> : <FileWarning className="h-3 w-3" />} {d.docType}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ranked findings = evidence index */}
          <Card>
            <CardHeader><CardTitle className="text-base">Findings (ranked) — evidence index</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ranked.length === 0 && <p className="text-sm text-muted-foreground">No red flags in the supplied records.</p>}
              {ranked.map((f, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={sev(f.severity)}>{f.severity}</Badge>
                    {f.evidenceGrade && <Badge variant="outline">Grade {f.evidenceGrade}</Badge>}
                    {typeof f.riskPoints === "number" && <Badge variant="muted">{f.riskPoints} pts</Badge>}
                    <span className="font-mono text-xs text-muted-foreground">{f.code}</span>
                    <span className="text-sm font-semibold">{f.title}</span>
                  </div>
                  <p className="mt-1 text-sm">{f.safeText ?? f.detail}</p>
                  {f.workedExample && <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs">ಸರಳ ಉದಾಹರಣೆ: {f.workedExample}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {f.ruleRef && <span>ನಿಯಮ: {f.ruleRef}</span>}
                    {f.recordToDemand && <span>ಬೇಕಾದ ದಾಖಲೆ: {f.recordToDemand}</span>}
                    {typeof f.lossExposure === "number" && f.lossExposure > 0 && <span>Possible exposure: {money(f.lossExposure)}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Loss exposure table */}
          {report.loss.lines.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Possible loss exposure (requires verification)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Possible exposure</TableHead><TableHead>Basis</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {report.loss.lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell>{l.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(l.exposure)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{l.formula}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="font-semibold">Total possible exposure</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{money(report.loss.totalPossibleExposure)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">Sum — not a proven loss</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${accent ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
