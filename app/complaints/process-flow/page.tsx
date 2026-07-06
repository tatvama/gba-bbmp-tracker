import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { EscalationFlowEditor } from "@/components/complaints/escalation-flow-editor";
import { listEscalationFlowConfigs, getEscalationStageCounts } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escalation flow" };

/**
 * A live, editable diagram of the no-reply escalation ladder: Filed -> Awaiting
 * reply -> Reminder sent -> Legal notice sent -> Escalated. The nodes ARE the
 * escalation_flow_configs rows the scheduler (lib/complaints/escalation-scheduler.ts)
 * reads — dragging repositions, clicking a stage edits its SLA/draft kind for real.
 */
export default async function ProcessFlowPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Escalation flow" />
        <EmptyState title="Not permitted" description="Your role cannot view the escalation flow." />
      </div>
    );
  }

  const [configs, counts] = await Promise.all([listEscalationFlowConfigs(), getEscalationStageCounts()]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Escalation flow"
        description="How the no-reply cycle runs on its own: each stage auto-drafts the next letter into the print queue when its SLA elapses. Drag a stage to reposition it; click one to edit its timing."
      />
      {configs.length === 0 ? (
        <EmptyState title="No escalation stages configured" description="Run the latest database migration (0031) to seed the default ladder." />
      ) : (
        <EscalationFlowEditor configs={configs} counts={counts} />
      )}
    </div>
  );
}
