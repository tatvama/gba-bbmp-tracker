import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RoadWorkGenerator } from "@/components/road-work/road-work-generator";
import { getRtiFormOptions } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Road Work RTI" };

export default async function RoadWorkRtiPage() {
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Road Work RTI" />
        <EmptyState
          title="Not permitted"
          description="Your role cannot create RTIs. Ask an admin for the RTI Manager or Editor role."
        />
      </div>
    );
  }

  const options = await getRtiFormOptions();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Road Work RTI generator"
        description="Give a short summary or upload a work order. AI drafts a road-work RTI from the standard inspection framework (insurance, trip sheets, royalty, MB book, road thickness, geo-tag photos). Review, edit, then approve to create the RTI case."
      />
      <RoadWorkGenerator outputType="rti" options={options} aiConfigured={isAiConfigured()} />
    </div>
  );
}
