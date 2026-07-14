import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { OcrQueue } from "@/components/complaints/ocr-queue";
import { listOcrJobs } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "OCR queue" };

export default async function OcrQueuePage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return <div><PageHeader title={t("form.ocrQueueTitle")} /><EmptyState title={t("form.notPermitted")} description={t("form.notPermittedOcrDesc")} /></div>;
  }
  const jobs = await listOcrJobs();
  return (
    <div>
      <PageHeader title={t("form.ocrQueueTitle")} description={t("form.ocrQueueDesc")} />
      <OcrQueue jobs={jobs} />
    </div>
  );
}
