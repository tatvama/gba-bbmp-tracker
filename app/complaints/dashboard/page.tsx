import { EmptyState } from "@/components/empty-state";
import { getGbaTree, getBbmpTree, listComplaints, countPrintPendingLetters } from "@/lib/queries";
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
        <EmptyState title="Access restricted" description="You do not have the required permissions to view this dashboard." />
      </div>
    );
  }

  const [gbaCorps, bbmpCorps, complaints, printPending] = await Promise.all([
    getGbaTree(),
    getBbmpTree(),
    listComplaints(),
    countPrintPendingLetters(),
  ]);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 bg-[#F8FAFC] min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Complaint Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1.5 font-semibold">
          Premium enterprise analytics visualizer. Toggle GBA/BBMP layers to trace complaints across corporations, divisions, sub-divisions, wards, and assigned field officers.
        </p>
      </div>

      {gbaCorps.length === 0 ? (
        <EmptyState
          title="No GBA data loaded"
          description="Run npm run db:seed-gba to load the 369-ward breakdown, then refresh."
        />
      ) : (
        <OrgTreemap
          gbaCorps={gbaCorps}
          bbmpCorps={bbmpCorps}
          complaints={complaints}
          printPending={printPending}
        />
      )}
    </div>
  );
}
