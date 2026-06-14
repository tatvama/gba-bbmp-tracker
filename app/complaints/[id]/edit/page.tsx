import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComplaintForm } from "@/components/complaints/complaint-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { updateComplaint } from "@/lib/actions/complaints";
import { getComplaint, getComplaintFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditComplaintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const [complaint, options] = await Promise.all([getComplaint(id), getComplaintFormOptions()]);
  if (!complaint) notFound();

  const action = updateComplaint.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit complaint / RTI" />
      <ComplaintForm action={action} options={options} initial={complaint} />
    </div>
  );
}
