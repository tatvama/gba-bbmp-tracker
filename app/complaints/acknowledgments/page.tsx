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
import { FileText, Calendar, Clock, CheckCircle2, AlertCircle, ArrowRight, Layers, Link2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getTranslations } from "@/lib/i18n/server";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attach Acknowledgments" };

export default async function AcknowledgmentsPage() {
  const user = await getSessionUser();
  const { t } = await getTranslations("complaints");
  if (!hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        <PageHeader title={t("advanced.shared.notPermittedTitle")} />
        <EmptyState title={t("advanced.shared.notPermittedTitle")} description={t("advanced.ack.notPermittedDesc")} />
      </div>
    );
  }

  const batches = await listAckBatchesAction();

  // Summary Metrics calculations
  const totalBatches = batches.length;
  const totalPages = batches.reduce((acc, b) => acc + (b.pageCount || 0), 0);
  const totalAttached = batches.reduce((acc, b) => acc + (b.committedCount || 0), 0);
  const needsReviewCount = batches.filter((b) => b.status === "review").length;

  const metrics = [
    { label: "Total Batches", value: totalBatches, icon: FileText, desc: "Scans uploaded" },
    { label: "Ingested Pages", value: totalPages, icon: Layers, desc: "OCR pages parsed" },
    { label: "Linked Cases", value: totalAttached, icon: Link2, desc: "Successfully attached" },
    { label: "Needs Review", value: needsReviewCount, icon: AlertCircle, desc: "Awaiting matching", alert: needsReviewCount > 0 },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6 pb-12">
      <PageHeader
        title={t("page.acknowledgmentsTitle")}
        description={t("advanced.ack.pageDescription")}
      />

      {!isAiConfigured() && (
        <div className="flex gap-2.5 rounded-xl border border-amber-250 bg-amber-50/20 p-3.5 text-xs text-amber-700 dark:border-slate-800 dark:bg-slate-950/35 dark:text-amber-400 shadow-3xs">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <p className="font-semibold leading-normal">
            {t("advanced.ack.aiNotConfigured")}
          </p>
        </div>
      )}

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4.5">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <Card key={i} className="border border-slate-205 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs overflow-hidden rounded-2xl transition-all duration-200 hover:shadow-2xs">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider leading-none">{m.label}</div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-200 mt-2 tracking-tight leading-none">
                    {m.value}
                  </div>
                  <div className="text-[9.5px] text-slate-450 dark:text-slate-500 font-bold mt-1.5 leading-none">
                    {m.desc}
                  </div>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-3xs ${
                  m.alert 
                    ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-950/30 dark:bg-amber-955/20" 
                    : "border-slate-100 bg-slate-50 dark:border-slate-850 dark:bg-slate-950 text-slate-455"
                }`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: Upload Workspaces */}
        <div className="lg:col-span-2 space-y-6">
          <AckReconcileUpload />

          <div className="relative flex py-2 items-center select-none">
            <div className="flex-grow border-t border-slate-200/60 dark:border-slate-850"></div>
            <span className="flex-shrink mx-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Alternative Matching Path</span>
            <div className="flex-grow border-t border-slate-200/60 dark:border-slate-850"></div>
          </div>

          <AckByFilenameUpload />

          {/* Recent Upload History Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between select-none">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("advanced.ack.recentUploadHistory", { count: batches.length }).replace(`(${batches.length})`, "")}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-extrabold">
                  {batches.length}
                </span>
              </h3>
              <AckClearCompletedButton
                clearableCount={batches.filter((b) => b.status === "committed" || b.status === "failed").length}
              />
            </div>

            {batches.length > 0 ? (
              <div className="space-y-3">
                {batches.map((b) => (
                  <AckBatchRow key={b.id} b={b} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/15 py-14 text-center dark:border-slate-800 dark:bg-slate-950/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 border text-slate-400 mb-4 shadow-3xs">
                  <FileText className="h-5.5 w-5.5" />
                </div>
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">No acknowledgement uploads yet</h4>
                <p className="text-[10.5px] text-slate-450 dark:text-slate-500 mt-2 max-w-[280px] font-medium leading-relaxed">
                  Upload scanned documents above to begin automatic OCR text splitting and complaint matching.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Information panel & guides */}
        <div className="space-y-6">
          <AckHelpPanel />
        </div>
      </div>
    </div>
  );
}
