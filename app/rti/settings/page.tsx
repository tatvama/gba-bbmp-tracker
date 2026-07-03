import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DeadlineRulesForm } from "@/components/rti/deadline-rules-form";
import { getDeadlineRules } from "@/lib/settings";
import { updateDeadlineRules } from "@/lib/actions/settings";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI settings" };

export default async function RtiSettingsPage() {
  const [rules, user] = await Promise.all([getDeadlineRules(), getSessionUser()]);
  if (!hasRole(user, ["ADMIN"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <PageHeader title="RTI settings" />
        <EmptyState title="Admins only" description="Only admins can change the deadline rules." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6 space-y-6">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 select-none no-print">
        Settings / RTI Deadline Rules
      </div>
      
      <PageHeader
        title="RTI deadline rules console"
        description="Configure the statutory deadline windows. The law/rules can change — edits here drive all deadline computation, countdown badges, and reports."
      />

      <DeadlineRulesForm action={updateDeadlineRules} initial={rules} />
    </div>
  );
}
