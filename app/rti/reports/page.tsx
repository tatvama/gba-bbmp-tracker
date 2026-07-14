import { PageHeader } from "@/components/page-header";
import { RtiReportsDashboard } from "@/components/reports/rti-reports-dashboard";
import {
  listRtis,
  listAllFirstAppeals,
  listAllSecondAppeals,
} from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI Reports" };

export default async function RtiReportsPage() {
  const [rtis, firstAppeals, secondAppeals, rules] = await Promise.all([
    listRtis(),
    listAllFirstAppeals(),
    listAllSecondAppeals(),
    getDeadlineRules(),
  ]);
  const { t } = await getTranslations("rti");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("page.reportsTitle")}
        description={t("advanced.reportsPage.description")}
      />
      <RtiReportsDashboard
        rtis={rtis}
        firstAppeals={firstAppeals}
        secondAppeals={secondAppeals}
        rules={rules}
      />
    </div>
  );
}
