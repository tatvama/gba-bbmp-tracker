"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, ArrowRight, Trash2, StopCircle, Loader2 } from "lucide-react";
import { deleteAckBatchAction } from "@/lib/actions/ack-import";
import { type AckBatchListRow } from "@/lib/complaints/ack-reconcile";
import { useTranslation } from "@/lib/i18n/client";
import { translateEnum } from "@/lib/i18n/translate-enum";

const STATUS_VARIANT: Record<string, string> = {
  processing: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/50",
  review: "bg-amber-50 text-amber-700 dark:bg-amber-955/40 dark:text-amber-300 border-amber-200/50",
  committing: "bg-indigo-50 text-indigo-700 dark:bg-indigo-955/40 dark:text-indigo-300 border-indigo-200/50",
  committed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-955/40 dark:text-emerald-300 border-emerald-200/50",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-955/40 dark:text-rose-300 border-rose-200/50",
};

export function AckBatchRow({ b }: { b: AckBatchListRow }) {
  const { t, locale } = useTranslation("complaints");
  const { t: tc } = useTranslation("common");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dateStr = new Date(b.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pending = b.itemCount - b.committedCount;
  const isActive = b.status === "processing" || b.status === "committing";

  const handleDelete = async () => {
    const name = b.originalName || "acknowledgments.pdf";
    const confirmMsg = isActive
      ? t("advanced.ack.deleteConfirmActive", { name })
      : t("advanced.ack.deleteConfirmInactive", { name });

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await deleteAckBatchAction(b.id);
      if (!res.ok) {
        setError(res.error || t("advanced.ack.deleteFailed"));
        setLoading(false);
      }
    } catch (e) {
      setError(tc("message.somethingWentWrong"));
      setLoading(false);
    }
  };

  return (
    <div className="group grid grid-cols-1 md:grid-cols-12 items-center gap-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-300 p-4">
      {/* Col 1 (Info details) - Spans 6/12 on tablet and 7/12 on desktop to guarantee no date/button overlap */}
      <div className="md:col-span-6 lg:col-span-7 flex items-center gap-3.5 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 text-slate-455 shadow-3xs group-hover:scale-102 transition-transform">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-205 truncate group-hover:text-primary transition-colors duration-200" title={b.originalName || "acknowledgments.pdf"}>
            {b.originalName || "acknowledgments.pdf"}
          </h4>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-455 dark:text-slate-500 font-bold leading-none">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="whitespace-nowrap">{dateStr}</span>
            <span className="text-slate-355 dark:text-slate-800">•</span>
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-450">{b.pageCount} {t("advanced.ack.pagesLabel").toLowerCase()}</span>
            <span className="text-slate-355 dark:text-slate-800">•</span>
            <span className="whitespace-nowrap text-slate-500 dark:text-slate-455">{b.itemCount} {t("advanced.ack.extractedLabel").toLowerCase()}</span>
            {error && (
              <>
                <span className="text-slate-355 dark:text-slate-800">•</span>
                <span className="text-rose-650 font-extrabold">{error}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Col 2 (Status & Progress) - Spans 3/12 on tablet and 2/12 on desktop */}
      <div className="md:col-span-3 lg:col-span-2 flex flex-row md:flex-col lg:flex-row items-center md:items-start lg:items-center gap-2.5 md:gap-2 lg:gap-2.5">
        {/* Status Badge */}
        <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider whitespace-nowrap ${STATUS_VARIANT[b.status] || "bg-slate-100 border-slate-200"}`}>
          {translateEnum("status", b.status, locale)}
        </span>

        {/* Progress Badge */}
        <span className="text-[9px] text-slate-500 dark:text-slate-450 font-extrabold whitespace-nowrap bg-slate-50 dark:bg-slate-955 border border-slate-150 dark:border-slate-850 px-2.5 py-0.5 rounded-full">
          {b.committedCount}/{b.itemCount} {t("advanced.ack.attachedLabel").toLowerCase()}
        </span>
      </div>

      {/* Col 3 (Actions) - Spans 3/12 and aligns right */}
      <div className="md:col-span-3 lg:col-span-3 flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-slate-100 dark:border-slate-850 pt-3 md:pt-0">
        <span className="text-[10px] text-slate-455 font-bold sm:hidden">
          {pending > 0 ? t("advanced.ack.itemsPending", { count: pending }) : t("advanced.ack.allItemsProcessed")}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Delete / Stop button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={loading}
            className={`h-8 text-xs font-bold px-3 gap-1 rounded-lg border cursor-pointer transition-all duration-200 ${
              isActive
                ? "border-amber-200 text-amber-600 bg-amber-50/10 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/20"
                : "border-rose-200 text-rose-600 bg-rose-50/10 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/20"
            }`}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isActive ? (
              <StopCircle className="h-3.5 w-3.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {isActive ? t("advanced.ack.stopButton") : tc("action.delete")}
          </Button>

          <Button
            size="sm"
            variant="default"
            className="h-8 text-xs font-extrabold px-3.5 gap-1.5 rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
            asChild
          >
            <Link href={`/complaints/acknowledgments/${b.id}`}>
              {b.status === "committed" ? t("advanced.ack.viewBatch") : t("advanced.ack.reviewAndMatch")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
