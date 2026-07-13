import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PrintButton } from "@/components/print-button";
import { getBBMPWorkById } from "@/lib/bbmp-works/search";
import { WorkDetailsCard } from "@/components/bbmp-works/work-details-card";
import { WorkHistoryPanel } from "@/components/bbmp-works/work-history-panel";
import { listAuditLogs } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function BBMPWorkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const work = await getBBMPWorkById(id);
  if (!work) notFound();

  const [logs, user] = await Promise.all([
    listAuditLogs({ entityType: "bbmp_work", entityId: work.id }, 50),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, WRITE_ROLES);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="no-print -ml-2">
          <Link href="/bbmp-works/search">
            <ArrowLeft className="h-4 w-4" /> Back to search
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <PrintButton className="no-print" />
          {canEdit && (
            <Button asChild size="sm" variant="outline" className="no-print">
              <Link href={`/bbmp-works/${work.id}/edit`}><Pencil className="h-4 w-4" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>
      <WorkDetailsCard work={work} />
      <Separator className="my-8" />
      <WorkHistoryPanel logs={logs} />
    </div>
  );
}
