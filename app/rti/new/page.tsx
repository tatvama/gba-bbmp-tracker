import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { RtiQuickCreateForm } from "@/components/rti/rti-quick-create-form";
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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New RTI application"
        description="Open a tracking record for an RTI you have filed (or are about to file). Add the request copy and the filing acknowledgement on the next screen — the 30-day reply clock starts from the filing date."
      />
      <RtiQuickCreateForm />
    </div>
  );
}
