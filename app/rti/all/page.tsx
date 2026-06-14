import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { RtiTable } from "@/components/rti/rti-table";
import { listRtis } from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "All RTIs" };

export default async function AllRtisPage() {
  const [rtis, rules, user] = await Promise.all([
    listRtis(),
    getDeadlineRules(),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, RTI_WRITE_ROLES);

  return (
    <div>
      <PageHeader title="All RTIs" description="Every RTI application with status, priority, and live deadline countdowns.">
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/rti/new"><Plus className="h-4 w-4" /> New RTI</Link>
          </Button>
        )}
      </PageHeader>
      <RtiTable data={rtis} rules={rules} />
    </div>
  );
}
