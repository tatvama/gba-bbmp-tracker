import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AckReconcileUpload } from "@/components/complaints/ack-reconcile-upload";
import { AckByFilenameUpload } from "@/components/complaints/ack-by-filename-upload";
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
              </div>
              <div className="space-y-3">
                {batches.map((b) => {
                  const dateStr = new Date(b.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const pending = b.itemCount - b.committedCount;
                  return (
                    <div
                      key={b.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-200 p-4"
                    >
                      {/* Left: Icon + File Details */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 sm:max-w-xs md:max-w-md lg:max-w-lg">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 text-slate-450">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-850 dark:text-slate-250 truncate group-hover:text-primary transition-colors" title={b.originalName || "acknowledgments.pdf"}>
                            {b.originalName || "acknowledgments.pdf"}
                          </h4>
                          <div className="flex items-center gap-1 text-[10px] text-slate-450 dark:text-slate-500 mt-1 font-semibold">
                            <Calendar className="h-3 w-3" />
                            <span>{dateStr}</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle Left: Status Badge */}
                      <div className="shrink-0 flex items-center">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${STATUS_VARIANT[b.status] || "bg-slate-100 border-slate-200"}`}>
                          {STATUS_LABEL[b.status] || b.status}
                        </span>
                      </div>

                      {/* Middle Right: Stats indicators */}
                      <div className="flex items-center gap-6 text-center sm:text-left shrink-0">
                        <div>
                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Pages</div>
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">{b.pageCount}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800" />
                        <div>
                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Extracted</div>
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">{b.itemCount}</div>
                        </div>
                        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800" />
                        <div>
                          <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Attached</div>
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">{b.committedCount}</div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 border-slate-50 pt-3 sm:pt-0 shrink-0">
                        <span className="text-[10px] text-slate-450 font-bold sm:hidden">
                          {pending > 0 ? `${pending} items pending` : "All items processed"}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-450 font-bold hidden sm:inline">
                            {pending > 0 ? `${pending} items pending` : "All items processed"}
                          </span>
                          <Button size="sm" variant="outline" className="h-8 text-xs font-bold px-3 gap-1 rounded-lg" asChild>
                            <Link href={`/complaints/acknowledgments/${b.id}`}>
                              {b.status === "committed" ? "View Batch" : "Review & Match"}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
