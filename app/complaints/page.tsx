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
      <PageHeader
        title="Complaint tracker"
        description="Every civic complaint with internal case number, replies, action taken, documents (OCR/AI), and follow-up reminders."
      >
        <ComplaintsHeaderActions canEdit={canEdit} />
      </PageHeader>
      <ComplaintTable data={complaints} />
    </div>
  );
}
