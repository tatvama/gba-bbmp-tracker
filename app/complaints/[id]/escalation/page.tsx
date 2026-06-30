import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { EscalationLadder } from "@/components/complaints/escalation-ladder";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escalation ladder" };

export default async function EscalationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Escalation ladder" />
        <EmptyState title="Not permitted" description="Your role cannot draft escalations." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Reply-gap analysis & escalation ladder"
        description="Analyse what the department's reply left unaddressed, then draft the next step — counter-reply, RTI, records-preservation, or escalation to the Lokayukta / Chief Secretary — pre-filled from the case history and forensic findings."
      />
      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-amber-400">
          AI is not configured — drafting and reply-gap analysis need ANTHROPIC_API_KEY.
        </p>
      )}
      <EscalationLadder complaintId={id} />
    </div>
  );
}
