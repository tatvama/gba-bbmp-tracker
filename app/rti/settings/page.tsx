import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DeadlineRulesForm } from "@/components/rti/deadline-rules-form";
import { getDeadlineRules } from "@/lib/settings";
import { updateDeadlineRules } from "@/lib/actions/settings";
import { getSessionUser, hasRole } from "@/lib/auth";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI settings" };

export default async function RtiSettingsPage() {
  const [rules, user] = await Promise.all([getDeadlineRules(), getSessionUser()]);
  const { t } = await getTranslations("rti");
  if (!hasRole(user, ["ADMIN"])) {
    return (
      <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6">
        <PageHeader title={t("advanced.settingsPage.shortTitle")} />
        <EmptyState
          title={t("advanced.settingsPage.adminsOnlyTitle")}
          description={t("advanced.settingsPage.adminsOnlyDescription")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 md:px-4 lg:px-6 space-y-6">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 select-none no-print">
        {t("advanced.settingsPage.breadcrumb")}
      </div>

      <PageHeader
        title={t("advanced.settingsPage.consoleTitle")}
        description={t("advanced.settingsPage.consoleDescription")}
      />

      <DeadlineRulesForm action={updateDeadlineRules} initial={rules} />
    </div>
  );
}
