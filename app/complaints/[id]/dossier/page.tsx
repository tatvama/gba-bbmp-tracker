import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/print-button";
import { DetailGrid, DetailRow } from "@/components/detail-row";
import { getComplaint, listComplaintDocuments } from "@/lib/queries";
import { getDivisionResponsibleOfficers } from "@/lib/dedupe-photos";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { formatDate, orDash } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseIntelligence } from "@/lib/intelligence/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence Dossier" };

const REFERENCE_LABELS = [
  "Administrative Approval (AA)", "Technical Sanction (TS)", "Agreement (KW-4)",
  "Work Order", "Tender Notification", "Mineral Dispatch Permit (MDP)",
  "Royalty Challan", "Insurance Policy",
];

const SEVERITY_BADGE = {
  High: "destructive",
  Medium: "warning",
  Low: "muted",
} as const;

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, complaint] = await Promise.all([getSessionUser(), getComplaint(id)]);
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Evidence Dossier" />
        <EmptyState title="Not permitted" description="Your role cannot view the evidence dossier. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }
  if (!complaint) notFound();

  const [docs, officers, intelRow] = await Promise.all([
    listComplaintDocuments(id),
    complaint.division_id ? getDivisionResponsibleOfficers(complaint.division_id) : Promise.resolve([]),
    createAdminClient().from("case_intelligence").select("artifact, build_status").eq("complaint_id", id).maybeSingle(),
  ]);

  const flagged = docs.filter(
    (d) => d.is_duplicate || (d.vision_verdict && d.vision_verdict !== "ok") || d.geo_flag === "far",
  );
  const intel = (intelRow.data?.artifact as CaseIntelligence | null) ?? null;
  const intelBuilding = !intel && (intelRow.data?.build_status === "queued" || intelRow.data?.build_status === "running");

  const references = intel ? REFERENCE_LABELS.map((label) => ({ label, refs: intel.references.filter((r) => r.label === label) })).filter((r) => r.refs.length) : [];
  const keyFindings = intel ? [...intel.findings, ...intel.correlations].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.severity] - { High: 0, Medium: 1, Low: 2 }[b.severity])) : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/complaints/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to case
        </Link>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/complaints/${id}/forensics`}>Run forensic audit</Link></Button>
          <PrintButton />
        </div>
      </div>

      <PageHeader
        title="Evidence dossier"
        description="A forensic evidence packet for escalation (RTI / Lokayukta / PIL). Each document carries its SHA-256 hash for chain-of-custody. Print to PDF to attach as annexures."
        badge={flagged.length ? <Badge variant="destructive">{flagged.length} flagged item(s)</Badge> : undefined}
      />

      {/* Case identity */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Case</h2>
        <DetailGrid cols={2}>
          <DetailRow label="Case number">{orDash(complaint.internal_case_number)}</DetailRow>
          <DetailRow label="Job / work-order no.">{orDash(complaint.job_number)}</DetailRow>
          <DetailRow label="Title">{complaint.title}</DetailRow>
          <DetailRow label="Road / location">{orDash(complaint.location)}</DetailRow>
          <DetailRow label="Contractor">{orDash(complaint.contractor)}</DetailRow>
          <DetailRow label="Division">{orDash(complaint.division?.name ?? null)}</DetailRow>
          <DetailRow label="Status">{complaint.status}</DetailRow>
          <DetailRow label="Submitted">{complaint.date_submitted ? formatDate(complaint.date_submitted) : "—"}</DetailRow>
        </DetailGrid>
      </section>

      {/* Responsible officers */}
      {officers.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Accountable officers (division)</h2>
          <ul className="space-y-1 text-sm">
            {officers.map((o) => (
              <li key={o.id}>
                <span className="font-medium">{o.role_level ? `${o.role_level} · ` : ""}{o.full_name}</span>
                {o.designation ? <span className="text-muted-foreground"> — {o.designation}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Legal & administrative references (Case Intelligence Engine) */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Legal &amp; administrative references
        </h2>
        {!intel ? (
          <EmptyState
            compact
            title={intelBuilding ? "Case analysis in progress" : "Case analysis not yet generated"}
            description={
              intelBuilding
                ? "Administrative Approval, Technical Sanction, KW-4 agreement, tender, MDP, royalty and insurance references are being extracted from this case's documents — refresh in a moment."
                : "Generate a draft letter for this case (or run the forensic audit) to extract Administrative Approval, Technical Sanction, KW-4 agreement, tender, MDP, royalty and insurance references from its documents."
            }
          />
        ) : references.length === 0 ? (
          <EmptyState compact title="No references found" description="No AA / TS / KW-4 / tender / MDP / royalty / insurance references were found in this case's documents." />
        ) : (
          <ul className="space-y-2 text-sm">
            {references.map((r) => (
              <li key={r.label}>
                <span className="font-semibold">{r.label}:</span>{" "}
                {r.refs.map((ref, i) => (
                  <span key={i} className="text-muted-foreground">
                    {i > 0 ? "; " : ""}{ref.value}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Documented suspicions / findings */}
      {intel && keyFindings.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Documented suspicions ({keyFindings.length})
          </h2>
          <ol className="space-y-3 text-sm">
            {keyFindings.map((f) => (
              <li key={f.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  {f.code && <span className="font-mono text-xs text-muted-foreground">[{f.code}]</span>}
                  <Badge variant={SEVERITY_BADGE[f.severity]}>{f.severity}</Badge>
                  <span className="font-medium">{f.statement}</span>
                </div>
                {f.recordToDemand && (
                  <div className="mt-0.5 text-xs text-muted-foreground">Record to demand: {f.recordToDemand}</div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Applicable legal framework */}
      {intel && intel.legalFramework.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Applicable legal framework
          </h2>
          <ul className="space-y-1 text-sm">
            {intel.legalFramework.map((l, i) => (
              <li key={i}>
                <span className="font-medium">{l.instrument}</span>
                <span className="text-muted-foreground"> — {l.relevance}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence manifest */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence manifest ({docs.length} document{docs.length === 1 ? "" : "s"})
        </h2>
        {docs.length === 0 ? (
          <EmptyState compact title="No documents" description="No documents attached to this case yet." />
        ) : (
          <ol className="space-y-3 text-sm">
            {docs.map((d, i) => (
              <li key={d.id} className="border-b border-border/50 pb-2 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i + 1}. {d.title || d.original_file_name || "Document"}</span>
                  <span className="text-xs text-muted-foreground">{d.document_type ?? "—"} · {formatDate(d.uploaded_at)}</span>
                  {d.is_duplicate && <Badge variant="destructive">Duplicate</Badge>}
                  {d.vision_verdict && d.vision_verdict !== "ok" && <Badge variant="warning">Vision: {d.vision_verdict}</Badge>}
                  {d.geo_flag === "far" && <Badge variant="destructive">GPS off-site</Badge>}
                </div>
                <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                  SHA-256: {d.file_sha256 ?? "(not computed — run backfill/OCR)"}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Generated {formatDate(new Date().toISOString())}. Findings (duplicate / off-site / vision) are
        AI/algorithmic indicators for human verification, not conclusive proof. Verify against originals before filing.
      </p>
    </div>
  );
}
