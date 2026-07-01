import { ComplaintsSettingsHeader } from "@/components/complaints/complaints-settings-header";
import { EmptyState } from "@/components/empty-state";
import { ComplaintSettingsForm } from "@/components/complaints/complaint-settings-form";
import { getComplaintSettings } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint settings" };

export default async function ComplaintSettingsPage() {
  const [settings, user] = await Promise.all([getComplaintSettings(), getSessionUser()]);
  if (!hasRole(user, ["ADMIN"])) {
    return (
      <div>
        <ComplaintsSettingsHeader />
        <EmptyState title="Admins only" description="Only admins can change complaint settings." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <ComplaintsSettingsHeader />
      <ComplaintSettingsForm initial={settings} />
    </div>
  );
}
