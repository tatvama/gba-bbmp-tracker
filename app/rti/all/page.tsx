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
          <Button asChild size="sm" className="w-full sm:w-auto h-11 sm:h-9 justify-center hover:scale-[1.01] active:scale-[0.99] transition-all font-semibold cursor-pointer">
            <Link href="/rti/new" className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> New RTI</Link>
          </Button>
        )}
      </PageHeader>
      <RtiTable data={rtis} rules={rules} />
    </div>
  );
}
