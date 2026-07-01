import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ContractorIntelligenceDashboard } from "@/components/complaints/contractor-intelligence-dashboard";
import { getContractorIntelligence, getDivisionIntelligence, getWorkSplitJobs } from "@/lib/queries";
import { detectWorkSplitting } from "@/lib/forensic/work-split";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contractor & division intelligence" };

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

      <ContractorIntelligenceDashboard
        initialContractors={contractors}
        initialDivisions={divisions}
        workSplits={workSplits}
      />
    </div>
  );
}
