import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { JobAuditRunner } from "@/components/complaints/job-audit-runner";
import { getJobAudit, listJobNumbers } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

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

  const [audit, jobs] = await Promise.all([getJobAudit(jobNumber), listJobNumbers()]);
  const known = jobs.find((j) => j.jobNumber === jobNumber);

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
      />
    </div>
  );
}
