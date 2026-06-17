import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LetterDrafter } from "@/components/letters/letter-drafter";
import { getJobAudit, listLetterDrafts } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Draft forensic letter" };

export default async function JobLetterPage({ params }: { params: Promise<{ jobNumber: string }> }) {
  const { jobNumber: raw } = await params;
  const jobNumber = decodeURIComponent(raw);
  const user = await getSessionUser();

  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Draft forensic letter" />
        <EmptyState title="Not permitted" description="Your role cannot draft forensic letters." />
      </div>
    );
  }

  const [audit, drafts] = await Promise.all([getJobAudit(jobNumber), listLetterDrafts(jobNumber)]);
  const savedDrafts = drafts.map((d) => ({
    id: d.id, variant: d.variant, language: d.language, content: d.content, lintOk: d.lintOk, signatoryKey: d.signatoryKey, createdAt: d.createdAt,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/complaints/job/${encodeURIComponent(jobNumber)}/audit`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to audit
      </Link>
      <PageHeader
        title={`Draft letter — Job ${jobNumber}`}
        description="Build a Kannada bill-stop notice, Lokayukta complaint, RTI application or bilingual summary from the forensic findings. Every adverse point is a documented suspicion seeking records — never an accusation. Drafts are editable and never auto-filed."
      />
      <LetterDrafter jobNumber={jobNumber} aiConfigured={isAiConfigured()} hasAudit={Boolean(audit?.report)} savedDrafts={savedDrafts} />
    </div>
  );
}
