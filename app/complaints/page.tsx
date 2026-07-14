import { PageHeader } from "@/components/page-header";
import { ComplaintsHeaderActions } from "@/components/complaints/complaints-header-actions";
import { ComplaintTable } from "@/components/complaints/complaint-table";
import { listComplaints, listDivisions, listSubDivisions, listWards } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaints" };

export default async function ComplaintsPage() {
  // Division/sub-division/ward filter options come from the master hierarchy
  // (not from `complaints`) so a division/sub-division/ward with zero
  // complaints on file is still a selectable, accurate filter option.
  const [complaints, allDivisions, allSubDivisions, allWards, user] = await Promise.all([
    listComplaints(),
    listDivisions(),
    listSubDivisions(),
    listWards(),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, COMPLAINT_WRITE_ROLES);

  return (
    <div>
      <ComplaintTable
        data={complaints}
        canEdit={canEdit}
        allDivisions={allDivisions}
        allSubDivisions={allSubDivisions}
        allWards={allWards}
      />
    </div>
  );
}
