import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { BillForensicsPanel } from "@/components/complaints/bill-forensics";
import { StructuredBillAudit } from "@/components/complaints/structured-bill-audit";
import { getComplaint } from "@/lib/queries";
import { isAiConfigured } from "@/lib/ai/provider";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forensic Audit" };

export default async function ComplaintForensicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, complaint] = await Promise.all([getSessionUser(), getComplaint(id)]);

  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return (
      <div>
        <PageHeader title="Forensic Audit" />
        <EmptyState title="Not permitted" description="Your role cannot run the forensic audit. Ask an admin for a Verifier / Complaint Manager / Editor role." />
      </div>
    );
  }
  if (!complaint) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/complaints/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to case
      </Link>
      <PageHeader
        title="Cross-document forensic audit"
        description={`${complaint.internal_case_number ?? ""} — recompute bill arithmetic and cross-check quantities/amounts across this case's bill, MB book, work order, estimate and trip sheet. Findings are suspicions for review.`}
      />
      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Structured bill audit (exact recompute + rate check)
          </h2>
          <StructuredBillAudit complaintId={id} aiConfigured={isAiConfigured()} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cross-document consistency (AI)
          </h2>
          <BillForensicsPanel complaintId={id} aiConfigured={isAiConfigured()} />
        </section>
      </div>
    </div>
  );
}
