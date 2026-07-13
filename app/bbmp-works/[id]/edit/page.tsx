import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { WorkEditForm } from "@/components/bbmp-works/work-edit-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { updateBbmpWork } from "@/lib/actions/bbmp-works";
import { getBBMPWorkById } from "@/lib/bbmp-works/search";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditBBMPWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, WRITE_ROLES)) {
    return (
      <EmptyState
        icon={Lock}
        title="Editor access required"
        description="Sign in as an Editor or Admin to edit BBMP work records."
      >
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const work = await getBBMPWorkById(id);
  if (!work) notFound();

  const action = updateBbmpWork.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Edit · BBMP work" description={work.workName || work.jobNumber || id} />
      <WorkEditForm action={action} work={work} />
    </div>
  );
}
