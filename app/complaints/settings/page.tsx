import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ComplaintSettingsForm } from "@/components/complaints/complaint-settings-form";
import { getComplaintSettings } from "@/lib/settings";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaint settings" };

export default async function ComplaintSettingsPage() {
  const [settings, user] = await Promise.all([getComplaintSettings(), getSessionUser()]);
  if (!hasRole(user, ["ADMIN"])) {
    return <div><PageHeader title="Complaint settings" /><EmptyState title="Admins only" description="Only admins can change complaint settings." /></div>;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Complaint settings" description="Case-number prefix, follow-up rules, OCR language, AI auto-summary, and upload limits." />
      <Card><CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader><CardContent><ComplaintSettingsForm initial={settings} /></CardContent></Card>
    </div>
  );
}
