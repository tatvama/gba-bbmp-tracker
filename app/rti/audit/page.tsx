import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AuditWizard } from "@/components/road-work/audit-wizard";
import { getRtiFormOptions, listRecipientOfficers } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit & Draft Wizard" };

export default async function AuditRtiPage() {
  const { t } = await getTranslations("rti");
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title={t("list.auditWizardTitle")} />
        <EmptyState
          title={t("list.auditNotPermittedTitle")}
          description={t("list.auditNotPermittedDescription")}
        />
      </div>
    );
  }

  const [options, officers] = await Promise.all([getRtiFormOptions(), listRecipientOfficers()]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("list.auditWizardTitle")}
        description={t("list.auditWizardDescription")}
      />
      <AuditWizard defaultOutputType="rti" wards={options.wards} officers={officers} aiConfigured={isAiConfigured()} />
    </div>
  );
}
