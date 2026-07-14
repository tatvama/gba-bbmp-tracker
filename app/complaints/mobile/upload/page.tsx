import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MobileUpload } from "@/components/complaints/mobile-upload";
import { listComplaints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mobile upload" };

export default async function MobileUploadPage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return <div><PageHeader title={t("upload.title")} /><EmptyState title={t("form.notPermitted")} description={t("form.notPermittedFieldOfficerDesc")} /></div>;
  }
  const complaints = await listComplaints();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("form.uploadPaperPhotoTitle")} description={t("form.uploadPaperPhotoDesc")} />
      <MobileUpload
        complaints={complaints.map((c) => ({ id: c.id, title: c.title, internal_case_number: c.internal_case_number }))}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
