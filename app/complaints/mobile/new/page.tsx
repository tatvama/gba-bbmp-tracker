import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ComplaintForm } from "@/components/complaints/complaint-form";
import { createComplaint } from "@/lib/actions/complaints";
import { getComplaintFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quick complaint" };

export default async function MobileNewComplaintPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return <div><PageHeader title="Quick complaint" /><EmptyState title="Not permitted" description="Complaint manager / editor access required." /></div>;
  }
  const options = await getComplaintFormOptions();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Quick complaint" description="Log a complaint fast; you can add documents and details afterwards." />
      <ComplaintForm action={createComplaint} options={options} />
    </div>
  );
}
