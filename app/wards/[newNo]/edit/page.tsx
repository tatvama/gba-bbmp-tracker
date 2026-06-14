import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { WardEditForm } from "@/components/wards/ward-edit-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { updateWard } from "@/lib/actions/wards";
import { getWard } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditWardPage({
  params,
}: {
  params: Promise<{ newNo: string }>;
}) {
  const { newNo } = await params;
  const n = Number(newNo);
  const user = await getSessionUser();
  if (!hasRole(user, WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required" description="Sign in as an Editor or Admin to edit wards.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const ward = await getWard(n);
  if (!ward) notFound();

  const action = updateWard.bind(null, n);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · Ward #${ward.new_no}`} description={ward.new_name} />
      <WardEditForm action={action} ward={ward} />
    </div>
  );
}
