import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SmartUpload } from "@/components/complaints/smart-upload";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload — ZIP or letter" };

export default async function ComplaintUploadPage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title={t("form.notPermitted")} />
        <EmptyState title={t("form.notPermitted")} description={t("form.notPermittedImportDesc")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 sm:px-6 lg:px-8">
      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-850 dark:bg-slate-950/35 dark:text-amber-400 no-print">
          {t("form.aiNotConfiguredWarning")}
        </p>
      )}
      <Suspense fallback={null}>
        <SmartUpload />
      </Suspense>
    </div>
  );
}
