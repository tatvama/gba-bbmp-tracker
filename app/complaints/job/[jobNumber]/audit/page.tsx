import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { JobAuditRunner } from "@/components/complaints/job-audit-runner";
import { getJobAudit, listJobNumbers, listJobAudits, listDismissedFindings } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job-Number Forensic Audit" };

export default async function JobAuditPage({ params }: { params: Promise<{ jobNumber: string }> }) {
  const { jobNumber: raw } = await params;
  const jobNumber = decodeURIComponent(raw);
  const user = await getSessionUser();

  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Job-Number Forensic Audit" />
        <EmptyState title="Not permitted" description="Your role cannot run the forensic audit. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }

  const [audit, jobs, history, dismissed] = await Promise.all([getJobAudit(jobNumber), listJobNumbers(), listJobAudits(jobNumber), listDismissedFindings(jobNumber)]);
  const known = jobs.find((j) => j.jobNumber === jobNumber);
  const bandVariant = (b: string | null) => (b === "bill_stop" || b === "serious" ? "destructive" : b === "procedural" ? "warning" : "muted");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/complaints/jobs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All job numbers
      </Link>
      <PageHeader
        title={`Forensic audit — Job ${jobNumber}`}
        description={`Aggregates every document across ${known?.complaints ?? 0} linked complaint(s) for this job number, AI-extracts the figures, then runs the deterministic forensic engines (arithmetic, quantity/rate, MB integrity, chronology, eligibility, insurance, royalty, photo flags) and grades the risk. Suspicions for review only.`}
      />
      <JobAuditRunner
        jobNumber={jobNumber}
        initialReport={audit?.report ?? null}
        initialMeta={audit ? { docCount: audit.docCount, createdAt: audit.createdAt } : null}
        aiConfigured={isAiConfigured()}
        initialDismissed={dismissed}
      />

      {history.length > 1 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Audit history (what changed between runs is itself evidence)</h2>
          <div className="space-y-1">
            {history.map((h, i) => {
              const prev = history[i + 1];
              const delta = prev ? h.riskScore - prev.riskScore : 0;
              return (
                <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                  <Badge variant={bandVariant(h.riskBand)}>{h.riskBand ?? "—"} · {h.riskScore}</Badge>
                  {prev && delta !== 0 && (
                    <span className={delta > 0 ? "text-destructive" : "text-emerald-700"}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs previous</span>
                  )}
                  <span className="text-muted-foreground">{h.findingCount} findings · {h.redFlagCount} red flags</span>
                  {i === 0 && <span className="text-xs text-muted-foreground">(latest)</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
