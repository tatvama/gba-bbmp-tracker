import Link from "next/link";
import { Users, Building2, Scissors, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { getContractorIntelligence, getDivisionIntelligence, getWorkSplitJobs } from "@/lib/queries";
import { detectWorkSplitting } from "@/lib/forensic/work-split";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contractor & division intelligence" };

const inr = (n: number) => (n > 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

export default async function ContractorIntelligencePage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Contractor & division intelligence" />
        <EmptyState title="Not permitted" description="Your role cannot view systemic intelligence." />
      </div>
    );
  }

  const [contractors, divisions, wsJobs] = await Promise.all([
    getContractorIntelligence(),
    getDivisionIntelligence(),
    getWorkSplitJobs(),
  ]);
  const workSplits = detectWorkSplitting(wsJobs);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Contractor & division intelligence"
        description="Systemic patterns across every imported job: repeat contractors, total possible exposure, and possible work-splitting to evade tender thresholds. All figures are possible amounts requiring verification; patterns are suspicions requiring enquiry, never accusations."
      />

      {/* Work-splitting / KTPP threshold evasion */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Scissors className="h-4 w-4" /> Possible work-splitting (KTPP threshold evasion) — {workSplits.length}
        </h2>
        {workSplits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No combined-value threshold crossings detected across same-contractor jobs.</p>
        ) : (
          <ul className="space-y-2">
            {workSplits.map((w, i) => (
              <li key={i} className="rounded-lg border border-amber-200/50 bg-amber-50/20 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold">{w.contractor}</span>
                  <Badge variant="warning">{inr(w.total)} total</Badge>
                  <span className="text-xs text-muted-foreground">crosses {inr(w.thresholdCrossed)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{w.note}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {w.jobNumbers.map((j) => (
                    <Link key={j} href={`/complaints/job/${encodeURIComponent(j)}/dossier`} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900">{j}</Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Contractor leaderboard */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-4 w-4" /> Contractors ({contractors.length})
        </h2>
        {contractors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contractor data yet — import jobs first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1.5 pr-3">Contractor</th>
                  <th className="py-1.5 pr-3">Jobs</th>
                  <th className="py-1.5 pr-3">Divisions</th>
                  <th className="py-1.5 pr-3">Possible exposure</th>
                  <th className="py-1.5 pr-3">Red flags</th>
                  <th className="py-1.5">Flag</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((c) => (
                  <tr key={c.contractor} className="border-t border-border/40">
                    <td className="py-1.5 pr-3">
                      <Link href={`/complaints/contractors/${encodeURIComponent(c.contractor)}`} className="font-medium underline">{c.contractor}</Link>
                    </td>
                    <td className="py-1.5 pr-3">{c.jobCount}</td>
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">{c.divisions.length}</td>
                    <td className="py-1.5 pr-3">{inr(c.totalExposure)}</td>
                    <td className="py-1.5 pr-3">{c.redFlags}</td>
                    <td className="py-1.5">{c.blacklistCandidate ? <Badge variant="destructive">review for blacklisting</Badge> : c.highRiskJobs > 0 ? <Badge variant="warning">{c.highRiskJobs} high-risk</Badge> : <Badge variant="muted">—</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Division summary */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-4 w-4" /> Divisions ({divisions.length})
        </h2>
        {divisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No division data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1.5 pr-3">Division</th>
                  <th className="py-1.5 pr-3">Jobs</th>
                  <th className="py-1.5 pr-3">Contractors</th>
                  <th className="py-1.5 pr-3">Possible exposure</th>
                  <th className="py-1.5">High-risk jobs</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.division} className="border-t border-border/40">
                    <td className="py-1.5 pr-3 font-medium">{d.division}</td>
                    <td className="py-1.5 pr-3">{d.jobCount}</td>
                    <td className="py-1.5 pr-3">{d.contractors}</td>
                    <td className="py-1.5 pr-3">{inr(d.totalExposure)}</td>
                    <td className="py-1.5">{d.highRiskJobs > 0 ? <Badge variant="warning">{d.highRiskJobs}</Badge> : "—"}</td>
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
