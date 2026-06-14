import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { OcrQueue } from "@/components/complaints/ocr-queue";
import { listOcrJobs } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "OCR queue" };

export default async function OcrQueuePage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return <div><PageHeader title="OCR queue" /><EmptyState title="Not permitted" description="OCR management requires verifier/manager access." /></div>;
  }
  const jobs = await listOcrJobs();
  return (
    <div>
      <PageHeader title="OCR queue" description="Queued, processing, completed and failed OCR jobs. Retry OCR or re-run AI per document." />
      <OcrQueue jobs={jobs} />
    </div>
  );
}
