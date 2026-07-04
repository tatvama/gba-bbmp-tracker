import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { getGbaTree, getBbmpTree, listComplaints } from "@/lib/queries";
import { OrgTreemap } from "@/components/complaints/org-treemap";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Complaint dashboard",
};

export default async function ComplaintDashboard() {
  const user = await getSessionUser();
  if (!hasRole(user, ["ADMIN", "COMPLAINT_MANAGER", "FIELD_OFFICER"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <PageHeader title="Complaint dashboard" />
        <EmptyState title="Access restricted" description="You do not have the required permissions to view this dashboard." />
      </div>
    );
  }

  const [gbaCorps, bbmpCorps, complaints] = await Promise.all([
    getGbaTree(),
    getBbmpTree(),
    listComplaints(),
  ]);

  return (
    <div>
      <PageHeader
        title="Complaint dashboard"
        description="Interactive hierarchy explorer for complaints — switch between GBA (369 wards) and BBMP-225 (225 wards). Click any node to drill down."
      />
      {gbaCorps.length === 0 ? (
        <EmptyState
          title="No GBA data loaded"
          description="Run npm run db:seed-gba to load the 369-ward breakdown, then refresh."
        />
      ) : (
        <OrgTreemap gbaCorps={gbaCorps} bbmpCorps={bbmpCorps} complaints={complaints} />
      )}
    </div>
  );
}
