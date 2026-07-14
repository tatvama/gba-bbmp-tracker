import { PageHeader } from "@/components/page-header";
import { RtiCalendar } from "@/components/rti/rti-calendar";
import { listRtis } from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI calendar" };

export default async function RtiCalendarPage() {
  const [rtis, rules] = await Promise.all([listRtis(), getDeadlineRules()]);
  const { t } = await getTranslations("rti");

  return (
    <div className="mx-auto max-w-7xl px-3 md:px-4 lg:px-6">
      <PageHeader
        title={t("page.calendarTitle")}
        description={t("advanced.calendarPage.description")}
      />
      <RtiCalendar rtis={rtis} rules={rules} />
    </div>
  );
}
