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
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border/40 pb-5">
          <div className="space-y-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl leading-none">
              Complaint settings
            </h1>
          </div>
        </div>
        <EmptyState title="Admins only" description="Only admins can change complaint settings." />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <ComplaintSettingsForm initial={settings} />
    </div>
  );
}
