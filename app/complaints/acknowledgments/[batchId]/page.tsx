import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AckReview } from "@/components/complaints/ack-review";
import { getAckBatchAction } from "@/lib/actions/ack-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review acknowledgments" };

export default async function AckReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title={t("advanced.shared.notPermittedTitle")} />
        <EmptyState title={t("advanced.shared.notPermittedTitle")} description={t("advanced.ack.notPermittedDesc")} />
      </div>
    );
  }

  const res = await getAckBatchAction(batchId);
  if ("error" in res) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <PageHeader title={t("advanced.ack.batchFallbackTitle")} breadcrumbs={[{ label: t("page.acknowledgmentsTitle"), href: "/complaints/acknowledgments" }, { label: t("advanced.ack.reviewBreadcrumb") }]} />
        <EmptyState title={t("advanced.ack.batchNotFoundTitle")} description={res.error} />
      </div>
    );
  }

  const { batch } = res;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title={batch.originalName || t("advanced.ack.batchFallbackTitle")}
        description={t("advanced.ack.reviewPageDescription")}
        breadcrumbs={[{ label: t("page.acknowledgmentsTitle"), href: "/complaints/acknowledgments" }, { label: t("advanced.ack.reviewBreadcrumb") }]}
      />
      <AckReview initial={batch} />
    </div>
  );
}
