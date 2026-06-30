import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { getContractorDossier } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contractor dossier" };

const inr = (n: number | null) => (typeof n === "number" && n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

function bandBadge(b: string | null) {
  if (b === "bill_stop" || b === "serious") return <Badge variant="destructive">{b}</Badge>;
  if (b === "procedural") return <Badge variant="warning">{b}</Badge>;
  if (b === "low") return <Badge variant="success">low</Badge>;
  return <Badge variant="muted">not audited</Badge>;
}

export default async function ContractorDossierPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const name = decodeURIComponent(raw);
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Contractor dossier" />
        <EmptyState title="Not permitted" description="Your role cannot view this dossier." />
      </div>
    );
  }

  const { summary, jobs } = await getContractorDossier(name);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/complaints/contractors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All contractors
      </Link>
      <PageHeader
        title={name}
        description="Every imported job for this contractor and its forensic risk. A pattern across jobs is a documented suspicion requiring enquiry, not an accusation."
        badge={summary?.blacklistCandidate ? <Badge variant="destructive">review for blacklisting</Badge> : undefined}
      />

      {summary && (
        <section className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-4">
          <div><span className="text-muted-foreground">Jobs:</span> {summary.jobCount}</div>
          <div><span className="text-muted-foreground">Divisions:</span> {summary.divisions.length}</div>
          <div><span className="text-muted-foreground">Possible exposure:</span> {inr(summary.totalExposure)}</div>
          <div><span className="text-muted-foreground">Red flags:</span> {summary.redFlags}</div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Jobs ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs found for this contractor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1.5 pr-3">Job code</th>
                  <th className="py-1.5 pr-3">Division</th>
                  <th className="py-1.5 pr-3">Net</th>
                  <th className="py-1.5 pr-3">Possible exposure</th>
                  <th className="py-1.5 pr-3">Risk</th>
                  <th className="py-1.5">Links</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.jobNumber} className="border-t border-border/40">
                    <td className="py-1.5 pr-3 font-mono text-xs">{j.jobNumber}</td>
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">{j.division ?? "—"}</td>
                    <td className="py-1.5 pr-3">{inr(j.net)}</td>
                    <td className="py-1.5 pr-3">{inr(j.exposure)}</td>
                    <td className="py-1.5 pr-3">{bandBadge(j.band)}</td>
                    <td className="py-1.5">
                      <Link href={`/complaints/job/${encodeURIComponent(j.jobNumber)}/dossier`} className="text-xs underline">dossier</Link>
                      {j.complaintId && <> · <Link href={`/complaints/${j.complaintId}`} className="text-xs underline">complaint</Link></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
