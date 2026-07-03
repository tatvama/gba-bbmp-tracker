import { PageHeader } from "@/components/page-header";
import { ComplaintsHeaderActions } from "@/components/complaints/complaints-header-actions";
import { ComplaintTable } from "@/components/complaints/complaint-table";
import { listComplaints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaints" };

export default async function ComplaintsPage() {
  const [complaints, user] = await Promise.all([listComplaints(), getSessionUser()]);
  const canEdit = hasRole(user, COMPLAINT_WRITE_ROLES);

  return (
    <div>
      <ComplaintTable data={complaints} canEdit={canEdit} />
    </div>
  );
}
