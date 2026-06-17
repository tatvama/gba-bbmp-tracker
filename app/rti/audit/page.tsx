import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AuditWizard } from "@/components/road-work/audit-wizard";
import { getRtiFormOptions, listRecipientOfficers } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { RTI_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit & Draft Wizard" };

export default async function AuditRtiPage() {
  const user = await getSessionUser();
  if (!hasRole(user, RTI_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Audit & Draft Wizard" />
        <EmptyState
          title="Not permitted"
          description="Your role cannot create RTIs. Ask an admin for the RTI Manager or Editor role."
        />
      </div>
    );
  }

  const [options, officers] = await Promise.all([getRtiFormOptions(), listRecipientOfficers()]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Audit & Draft Wizard"
        description="A guided BBMP road-work forensic audit: describe the issue, smart-select suspicions from the 180-point bank, choose To Whom (officer escalation chain) and From Whom (applicant), then generate an RTI or letter. Every point is framed as a suspicion, never an accusation; nothing is filed automatically."
      />
      <AuditWizard defaultOutputType="rti" wards={options.wards} officers={officers} aiConfigured={isAiConfigured()} />
    </div>
  );
}
