import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AckReconcileUpload } from "@/components/complaints/ack-reconcile-upload";
import { listAckBatchesAction } from "@/lib/actions/ack-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attach Acknowledgments" };

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing…",
  review: "Ready to review",
  committing: "Attaching…",
  committed: "Done",
  failed: "Failed",
};

export default async function AcknowledgmentsPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Not Permitted" />
        <EmptyState title="Not permitted" description="Your role cannot import or attach acknowledgments." />
      </div>
    );
  }

  const batches = await listAckBatchesAction();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Attach Acknowledgments"
        description="Upload one scanned PDF of many BBMP acknowledgments — the system splits it, matches each to the right complaint, and you confirm before attaching."
      />

      {!isAiConfigured() && (
        <p className="rounded-lg border border-amber-200/50 bg-amber-50/30 p-3 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/35 dark:text-amber-400">
          AI is not configured on the server. Acknowledgments are still split (one section per page as a safe default) and matched by exact job code / complaint number, but subject-based matching and boundary detection need an API key.
        </p>
      )}

      <AckReconcileUpload />

      {batches.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800">
            Recent batches
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/complaints/acknowledgments/${b.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{b.originalName || "acknowledgments.pdf"}</span>
                  <span className="shrink-0 text-xs text-slate-400">{b.pageCount} pages</span>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{b.committedCount}/{b.itemCount} attached</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${b.status === "committed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : b.status === "failed" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : b.status === "review" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {STATUS_LABEL[b.status] || b.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
