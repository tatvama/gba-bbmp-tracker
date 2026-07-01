import { PageHeader } from "@/components/page-header";
import { RtiCalendar } from "@/components/rti/rti-calendar";
import { listRtis } from "@/lib/queries";
import { getDeadlineRules } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "RTI calendar" };

export default async function RtiCalendarPage() {
  const [rtis, rules] = await Promise.all([listRtis(), getDeadlineRules()]);

  return (
    <div className="mx-auto max-w-3xl px-3 md:px-4 lg:px-6">
      <PageHeader
        title="RTI deadline calendar"
        description="Every open RTI's next statutory deadline — reply, first appeal, or second appeal — soonest first."
      />
      <RtiCalendar rtis={rtis} rules={rules} />
    </div>
  );
}
