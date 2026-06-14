import Link from "next/link";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ComplaintForm } from "@/components/complaints/complaint-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { createComplaint } from "@/lib/actions/complaints";
import { getComplaintFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewComplaintPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required" description="Sign in as an Editor or Admin to log complaints.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }
  const options = await getComplaintFormOptions();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New complaint / RTI" />
      <ComplaintForm action={createComplaint} options={options} />
    </div>
  );
}
