import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RoadWorkGenerator } from "@/components/road-work/road-work-generator";
import { getRtiFormOptions } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Road Work RTI" };

export default async function RoadWorkRtiPage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("rti");
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title={t("advanced.roadWorkPage.shortTitle")} />
        <EmptyState
          title={t("advanced.notPermittedTitle")}
          description={t("advanced.roadWorkPage.notPermittedDescription")}
        />
      </div>
    );
  }

  const options = await getRtiFormOptions();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("advanced.roadWorkPage.generatorTitle")}
        description={t("advanced.roadWorkPage.generatorDescription")}
      />
      <RoadWorkGenerator outputType="rti" options={options} aiConfigured={isAiConfigured()} />
    </div>
  );
}
