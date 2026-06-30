import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ComplaintIntakeImport } from "@/components/complaints/complaint-intake-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create complaint from a letter" };

export default async function ComplaintIntakePage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return (
      <div>
        <PageHeader title="Create complaint from a letter" />
        <EmptyState title="Not permitted" description="Your role cannot create complaints." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Create complaint from a letter (AI)"
        description="No ZIP, no job code needed — just upload a complaint letter or acknowledgement. AI recognises the department, subject and type, suggests next actions, and creates a complaint you then track stage by stage."
      />
      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-amber-400">
          AI is not configured — recognition will be limited. You can still upload and create the complaint, then fill in details manually.
        </p>
      )}
      <ComplaintIntakeImport />
    </div>
  );
}
