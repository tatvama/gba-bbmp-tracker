import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AckReconcileUpload } from "@/components/complaints/ack-reconcile-upload";
import { AckByFilenameUpload } from "@/components/complaints/ack-by-filename-upload";
import { AckBatchRow } from "@/components/complaints/ack-batch-row";
import { AckClearCompletedButton } from "@/components/complaints/ack-clear-completed-button";
import { Button } from "@/components/ui/button";
import { AckHelpPanel } from "@/components/complaints/ack-help-panel";
import { listAckBatchesAction } from "@/lib/actions/ack-import";
import { getSessionUser, hasRole } from "@/lib/auth";
import { isAiConfigured } from "@/lib/ai/provider";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { FileText, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attach Acknowledgments" };

const STATUS_VARIANT: Record<string, string> = {
  processing: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/50",
  review: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/50",
  committed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/50",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  review: "Needs Review",
  committing: "Attaching",
  committed: "Attached",
  failed: "Failed",
};

export default async function AcknowledgmentsPage() {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div>
        <PageHeader title="Not Permitted" />
        <EmptyState title="Not permitted" description="Your role cannot review acknowledgments." />
      </div>
    );
  }

  const batches = await listAckBatchesAction();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title="Attach Acknowledgments"
        description="Upload scanned PDF receipt batches. The AI splits them page-by-page, extracts details, and links them to cases."
      />

      {!isAiConfigured() && (
        <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/20 p-3.5 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/35 dark:text-amber-400">
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <p>
            AI is not configured on the server. Acknowledgments will default to one section per page and exact matches, but semantic understanding requires an API key.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <AckReconcileUpload />

          <AckByFilenameUpload />

          {batches.length > 0 && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Recent Upload History ({batches.length})
                </h3>
                <AckClearCompletedButton
                  clearableCount={batches.filter((b) => b.status === "committed" || b.status === "failed").length}
                />
              </div>
              <div className="space-y-3">
                {batches.map((b) => (
                  <AckBatchRow key={b.id} b={b} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <AckHelpPanel />
        </div>
      </div>
    </div>
  );
}
