import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RtiWizard } from "@/components/rti/rti-wizard";
import { getRtiFormOptions, listRtiTemplates } from "@/lib/queries";
import { createRti } from "@/lib/actions/rti";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "New RTI" };

export default async function NewRtiPage() {
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="New RTI" />
        <EmptyState
          title="Not permitted"
          description="Your role cannot create RTIs. Ask an admin for the RTI Manager or Editor role."
        />
      </div>
    );
  }

  const [options, templates] = await Promise.all([
    getRtiFormOptions(),
    listRtiTemplates("rti_application"),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New RTI application"
        description="Step through jurisdiction, authority, applicant, the information you want, and filing details. AI drafting is optional and never files anything."
      />
      <RtiWizard
        action={createRti}
        options={options}
        templates={templates}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
