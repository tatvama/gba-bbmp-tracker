import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RoadWorkGenerator } from "@/components/road-work/road-work-generator";
import { getComplaintFormOptions } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Road Work Complaint" };

export default async function RoadWorkComplaintPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Road Work Complaint" />
        <EmptyState
          title="Not permitted"
          description="Your role cannot create complaints. Ask an admin for the Complaint Manager or Editor role."
        />
      </div>
    );
  }

  const options = await getComplaintFormOptions();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Road Work Complaint generator"
        description="Give a short summary or upload a work order. AI drafts a road-work complaint from the standard inspection framework with legal basis and officer accountability. Review, edit, then approve to create the complaint case (the work order is attached automatically)."
      />
      <RoadWorkGenerator outputType="complaint" options={options} aiConfigured={isAiConfigured()} />
    </div>
  );
}
