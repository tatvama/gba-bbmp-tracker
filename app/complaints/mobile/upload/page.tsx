import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MobileUpload } from "@/components/complaints/mobile-upload";
import { listComplaints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mobile upload" };

export default async function MobileUploadPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return <div><PageHeader title="Upload document" /><EmptyState title="Not permitted" description="Field officer access required to upload." /></div>;
  }
  const complaints = await listComplaints();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Upload paper / photo" description="Capture printed complaints, replies, ATRs, receipts, or site photos from your phone." />
      <MobileUpload
        complaints={complaints.map((c) => ({ id: c.id, title: c.title, internal_case_number: c.internal_case_number }))}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
