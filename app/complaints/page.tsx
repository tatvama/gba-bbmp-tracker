import Link from "next/link";
import { Plus, LayoutDashboard, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ComplaintTable } from "@/components/complaints/complaint-table";
import { listComplaints } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complaints" };

export default async function ComplaintsPage() {
  const [complaints, user] = await Promise.all([listComplaints(), getSessionUser()]);
  const canEdit = hasRole(user, COMPLAINT_WRITE_ROLES);

  return (
    <div>
      <PageHeader
        title="Complaint tracker"
        description="Every civic complaint with internal case number, replies, action taken, documents (OCR/AI), and follow-up reminders."
      >
        <Button asChild size="sm" variant="outline"><Link href="/complaints/dashboard"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link></Button>
        <Button asChild size="sm" variant="outline"><Link href="/complaints/mobile/upload"><Smartphone className="h-4 w-4" /> Mobile</Link></Button>
        {canEdit && <Button asChild size="sm"><Link href="/complaints/new"><Plus className="h-4 w-4" /> New</Link></Button>}
      </PageHeader>
      <ComplaintTable data={complaints} />
    </div>
  );
}
