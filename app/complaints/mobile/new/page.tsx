import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ComplaintForm } from "@/components/complaints/complaint-form";
import { createComplaint } from "@/lib/actions/complaints";
import { getComplaintFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quick complaint" };

export default async function MobileNewComplaintPage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return <div><PageHeader title={t("form.quickComplaintTitle")} /><EmptyState title={t("form.notPermitted")} description={t("form.notPermittedComplaintWriteDesc")} /></div>;
  }
  const options = await getComplaintFormOptions();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("form.quickComplaintTitle")} description={t("form.quickComplaintDesc")} />
      <ComplaintForm action={createComplaint} options={options} />
    </div>
  );
}
