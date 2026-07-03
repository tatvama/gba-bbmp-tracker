import { Suspense } from "react";
import Link from "next/link";
import { Plus, Download, FileSpreadsheet, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RtiTable } from "@/components/rti/rti-table";
import { listRtis } from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "All RTIs Applications" };

export default async function AllRtisPage() {
  const [rtis, rules, user] = await Promise.all([
    listRtis(),
    getDeadlineRules(),
    getSessionUser(),
  ]);
  const canEdit = hasRole(user, RTI_WRITE_ROLES);

  return (
    <div className="space-y-6">
      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5 no-print">
        <div className="space-y-1.5">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground/80 font-medium">
            <Link href="/rti" className="hover:text-foreground transition-colors">Dashboard</Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            <Link href="/rti" className="hover:text-foreground transition-colors">RTIs</Link>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/45" />
            <span className="text-foreground font-semibold">All RTIs</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl leading-none">
            All RTI Applications
          </h1>
          <p className="max-w-3xl text-xs sm:text-sm leading-relaxed text-muted-foreground/95 font-medium">
            Manage, monitor and track every RTI throughout its statutory lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {canEdit && (
            <Button asChild size="sm" className="h-9 font-bold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer">
              <Link href="/rti/new">
                <Plus className="h-4 w-4 mr-1.5" /> New RTI
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="h-9 font-bold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer">
            <Link href="/rti/settings">
              <Download className="h-4 w-4 mr-1.5" /> Import
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 font-bold hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer">
            <Link href="/rti/reports">
              <BarChart2 className="h-4 w-4 mr-1.5" /> Reports
            </Link>
          </Button>
        </div>
      </div>

      <RtiTable data={rtis} rules={rules} canEdit={canEdit} />
    </div>
  );
}
