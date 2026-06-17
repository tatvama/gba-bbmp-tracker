import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { getJobAudit, getJobDossier, listLetterDrafts } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job Evidence Dossier" };

const inr = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

export default async function JobDossierPage({ params }: { params: Promise<{ jobNumber: string }> }) {
  const { jobNumber: raw } = await params;
  const jobNumber = decodeURIComponent(raw);
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Job Evidence Dossier" />
        <EmptyState title="Not permitted" description="Your role cannot view the evidence dossier." />
      </div>
    );
  }

  const [audit, complaints, drafts] = await Promise.all([
    getJobAudit(jobNumber),
    getJobDossier(jobNumber),
    listLetterDrafts(jobNumber),
  ]);
  const report = audit?.report ?? null;
  const ranked = report?.rankedFindings ?? [];
  const latestLetter = drafts[0] ?? null;
  const totalDocs = complaints.reduce((s, c) => s + c.documents.length, 0);
  const contractor = complaints.find((c) => c.contractor)?.contractor ?? null;
  const division = complaints.find((c) => c.division)?.division ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/audit`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to audit
        </Link>
        <div className="flex gap-2">
          {latestLetter && (
            <Button asChild size="sm" variant="outline"><a href={`/api/job-audit/${encodeURIComponent(jobNumber)}/letter?draftId=${latestLetter.id}`} download>Download letter (.docx)</a></Button>
          )}
          <PrintButton />
        </div>
      </div>

      <PageHeader
        title={`Job evidence dossier — ${jobNumber}`}
        description="A consolidated forensic packet for escalation (RTI / Lokayukta / PIL): the job audit findings, the drafted letter, and every linked document with its SHA-256 chain-of-custody. Print to PDF to attach as annexures."
        badge={report ? <Badge variant={report.risk.band === "bill_stop" || report.risk.band === "serious" ? "destructive" : "muted"}>{report.risk.band} · {report.risk.score}/100</Badge> : undefined}
      />

      {/* Job identity */}
      <section className="mb-6 rounded-xl border bg-card p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Job</h2>
        <div className="grid gap-1 sm:grid-cols-2">
          <div><span className="text-muted-foreground">Job / work-order no.:</span> <span className="font-mono">{jobNumber}</span></div>
          <div><span className="text-muted-foreground">Contractor:</span> {contractor ?? "—"}</div>
          <div><span className="text-muted-foreground">Division:</span> {division ?? "—"}</div>
          <div><span className="text-muted-foreground">Linked cases:</span> {complaints.length} · {totalDocs} documents</div>
          {report && <div><span className="text-muted-foreground">Possible exposure:</span> {inr(report.loss.totalPossibleExposure)}</div>}
          {report && <div><span className="text-muted-foreground">Red flags:</span> {report.counts.redFlags}</div>}
        </div>
      </section>

      {/* Findings */}
      {report ? (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Forensic findings (suspicions for review)</h2>
          <ol className="space-y-2 text-sm">
            {ranked.map((f, i) => (
              <li key={i} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={f.severity === "High" ? "destructive" : f.severity === "Medium" ? "warning" : "muted"}>{f.severity}</Badge>
                  {f.evidenceGrade && <Badge variant="outline">Grade {f.evidenceGrade}</Badge>}
                  <span className="font-semibold">{i + 1}. {f.title}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{f.safeText ?? f.detail}</p>
                {f.recordToDemand && <p className="mt-0.5 text-xs text-muted-foreground">Record to demand: {f.recordToDemand}</p>}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className="mb-6 rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm text-amber-dark">
          No forensic audit has been run for this job yet. Run it from the <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/audit`} className="underline">audit page</Link> first.
        </section>
      )}

      {/* Drafted letter */}
      {latestLetter?.content && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Drafted letter ({latestLetter.variant}) {latestLetter.lintOk ? <Badge variant="success">safe-language ✓</Badge> : <Badge variant="destructive">lint failed</Badge>}
          </h2>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed">{latestLetter.content}</pre>
        </section>
      )}

      {/* Evidence manifest grouped by case */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Evidence manifest ({totalDocs} documents across {complaints.length} cases)</h2>
        {complaints.map((c) => (
          <div key={c.id} className="mb-3 last:mb-0">
            <p className="text-sm font-semibold">{c.caseNumber ?? c.title} <span className="font-normal text-muted-foreground">— {c.location ?? "—"}</span></p>
            <ol className="mt-1 space-y-1.5 pl-3 text-sm">
              {c.documents.length === 0 && <li className="text-muted-foreground">No documents.</li>}
              {c.documents.map((d, i) => (
                <li key={d.id} className="border-b border-border/40 pb-1 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{i + 1}. {d.title || "Document"}</span>
                    <span className="text-xs text-muted-foreground">{d.documentType ?? "—"} · {d.uploadedAt ? formatDate(d.uploadedAt) : "—"}</span>
                    {d.isDuplicate && <Badge variant="destructive">Duplicate</Badge>}
                    {d.visionVerdict && d.visionVerdict !== "ok" && <Badge variant="warning">Vision: {d.visionVerdict}</Badge>}
                    {d.geoFlag === "far" && <Badge variant="destructive">GPS off-site</Badge>}
                  </div>
                  <div className="break-all font-mono text-[10px] text-muted-foreground">SHA-256: {d.sha256 ?? "(not computed — run backfill/OCR)"}</div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <p className="text-xs text-muted-foreground">
        Generated {formatDate(new Date().toISOString())}. All findings are documented suspicions requiring records and explanation — not conclusive proof. Exposure figures are possible amounts requiring verification. Verify against originals before filing.
      </p>
    </div>
  );
}
