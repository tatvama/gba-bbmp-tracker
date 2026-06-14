import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RoadWorkReplyAnalyzer } from "@/components/road-work/reply-analyzer";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Road Work Reply Analyzer" };

export default async function RoadWorkAnalyzePage() {
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES) && !hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Road Work Reply Analyzer" />
        <EmptyState title="Not permitted" description="Your role cannot analyse replies. Ask an admin for an Editor / RTI Manager / Complaint Manager role." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Road Work Reply Analyzer"
        description="Paste what you asked for and BBMP's reply. AI checks the reply against the 60-point framework, flags what was answered / dodged / denied per section, and auto-drafts the first appeal or escalation from the gaps."
      />
      <RoadWorkReplyAnalyzer aiConfigured={isAiConfigured()} />
    </div>
  );
}
