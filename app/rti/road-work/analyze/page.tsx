import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RoadWorkReplyAnalyzer } from "@/components/road-work/reply-analyzer";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES, COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Road Work Reply Analyzer" };

export default async function RoadWorkAnalyzePage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("rti");
  if (!hasRole(user, RTI_WRITE_ROLES) && !hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title={t("advanced.roadWorkAnalyzePage.title")} />
        <EmptyState
          title={t("advanced.notPermittedTitle")}
          description={t("advanced.roadWorkAnalyzePage.notPermittedDescription")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("advanced.roadWorkAnalyzePage.title")}
        description={t("advanced.roadWorkAnalyzePage.description")}
      />
      <RoadWorkReplyAnalyzer aiConfigured={isAiConfigured()} />
    </div>
  );
}
