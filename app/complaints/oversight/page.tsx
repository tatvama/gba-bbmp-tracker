import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { OversightDashboardClient } from "@/components/complaints/oversight-dashboard-client";
import {
  getOversightStats,
  getOverdueCounts,
  getContractorIntelligence,
  getDivisionIntelligence,
} from "@/lib/queries";
import { runJobPhotoDuplicateAudit } from "@/lib/forensic/job-photo-dedupe";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forensic oversight dashboard" };

export default async function OversightPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Forensic oversight dashboard" />
        <EmptyState title="Not permitted" description="Your role cannot view the oversight dashboard." />
      </div>
    );
  }

  const [stats, overdue, contractors, divisions, dupClusters] = await Promise.all([
    getOversightStats(),
    getOverdueCounts(),
    getContractorIntelligence(),
    getDivisionIntelligence(),
    runJobPhotoDuplicateAudit(),
  ]);
  const sameDivDup = dupClusters.filter((c) => c.sameDivisionReuse).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header on Desktop */}
      <div className="hidden md:block">
        <PageHeader
          title="Forensic oversight dashboard"
          description="Platform-wide accountability view. All exposure figures are possible amounts requiring verification; risk bands and patterns are documented suspicions for enquiry, not findings of guilt."
        />
      </div>

      <OversightDashboardClient
        stats={stats}
        overdue={overdue}
        contractors={contractors}
        divisions={divisions}
        dupClustersCount={dupClusters.length}
        sameDivDup={sameDivDup}
      />
    </div>
  );
}
