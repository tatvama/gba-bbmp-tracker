import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DocumentAuditor } from "@/components/road-work/document-auditor";
import { getComplaintFormOptions } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES, RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bill / MB Audit" };

export default async function RoadWorkAuditPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES) && !hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Bill / MB Audit" />
        <EmptyState title="Not permitted" description="Your role cannot run document audits. Ask an admin for an Editor / Complaint Manager / RTI Manager role." />
      </div>
    );
  }

  const options = await getComplaintFormOptions();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Bill / MB-book red-flag audit"
        description="Upload a bill, Measurement Book, estimate or measurement sheet. AI runs it against the 60-point framework and flags apparent irregularities (missing royalty, quantity mismatch, thickness shortfall, salvage not deducted, fictitious measurement signs). Findings are suspicions for review — one click drafts a complaint from them."
      />
      <DocumentAuditor options={options} aiConfigured={isAiConfigured()} />
    </div>
  );
}
