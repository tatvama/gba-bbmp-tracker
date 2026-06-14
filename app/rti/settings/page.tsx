import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div>
        <PageHeader title="RTI settings" />
        <EmptyState title="Admins only" description="Only admins can change the deadline rules." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="RTI deadline rules"
        description="Configure the statutory deadline windows. The law/rules can change — edits here drive all deadline computation, countdown badges, and reports."
      />
      <Card>
        <CardHeader><CardTitle className="text-base">Deadline configuration</CardTitle></CardHeader>
        <CardContent>
          <DeadlineRulesForm action={updateDeadlineRules} initial={rules} />
        </CardContent>
      </Card>
    </div>
  );
}
