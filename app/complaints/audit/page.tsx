import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AuditWizard } from "@/components/road-work/audit-wizard";
import { getComplaintFormOptions, listRecipientOfficers } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit & Draft Wizard" };

export default async function AuditComplaintPage() {
  const { t } = await getTranslations("complaints");
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title={t("list.audit.title")} />
        <EmptyState
          title={t("list.notPermittedTitle")}
          description={t("list.audit.notPermittedDescription")}
        />
      </div>
    );
  }

  const [options, officers] = await Promise.all([getComplaintFormOptions(), listRecipientOfficers()]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("list.audit.title")}
        description={t("list.audit.description")}
      />
      <AuditWizard defaultOutputType="complaint" wards={options.wards} officers={officers} aiConfigured={isAiConfigured()} />
    </div>
  );
}
