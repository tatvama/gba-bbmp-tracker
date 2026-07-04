import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AckReview } from "@/components/complaints/ack-review";
import { getAckBatchAction } from "@/lib/actions/ack-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review acknowledgments" };

export default async function AckReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Not Permitted" />
        <EmptyState title="Not permitted" description="Your role cannot review acknowledgments." />
      </div>
    );
  }

  const res = await getAckBatchAction(batchId);
  if ("error" in res) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <PageHeader title="Acknowledgment batch" breadcrumbs={[{ label: "Attach Acknowledgments", href: "/complaints/acknowledgments" }, { label: "Review" }]} />
        <EmptyState title="Batch not found" description={res.error} />
      </div>
    );
  }

  const { batch } = res;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title={batch.originalName || "Acknowledgment batch"}
        description="Confirm which complaint each acknowledgment belongs to. Job-code and complaint-number matches are the most reliable; adjust boundaries on the page strip if a section groups the wrong pages."
        breadcrumbs={[{ label: "Attach Acknowledgments", href: "/complaints/acknowledgments" }, { label: "Review" }]}
      />
      <AckReview initial={batch} />
    </div>
  );
}
