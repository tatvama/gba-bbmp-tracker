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
  review: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/50",
  committing: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200/50",
  committed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/50",
  failed: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/50",
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
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-805 dark:bg-slate-900 shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-300 p-4.5">
      {/* Left: Icon + File Details */}
      <div className="flex items-center gap-3.5 min-w-[200px] flex-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 text-slate-455 shadow-3xs group-hover:scale-102 transition-transform">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate group-hover:text-primary transition-colors duration-200" title={b.originalName || "acknowledgments.pdf"}>
            {b.originalName || "acknowledgments.pdf"}
          </h4>
          <div className="flex items-center gap-2 text-[10px] text-slate-450 dark:text-slate-500 mt-1 font-bold whitespace-nowrap">
            <Calendar className="h-3.5 w-3.5" />
            <span>{dateStr}</span>
            {error && <span className="text-rose-600 font-extrabold">• {error}</span>}
          </div>
        </div>
      </div>

      {/* Middle Left: Status Badge */}
      <div className="shrink-0 flex items-center">
        <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${STATUS_VARIANT[b.status] || "bg-slate-100 border-slate-200"}`}>
          {translateEnum("status", b.status, locale)}
        </span>
      </div>

      {/* Middle Right: Stats indicators */}
      <div className="flex items-center gap-5 text-center sm:text-left shrink-0">
        <div className="min-w-[48px]">
          <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{t("advanced.ack.pagesLabel")}</div>
          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-350 mt-1">{b.pageCount}</div>
        </div>
        <div className="h-8 w-px bg-slate-150 dark:bg-slate-800" />
        <div className="min-w-[48px]">
          <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{t("advanced.ack.extractedLabel")}</div>
          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-350 mt-1">{b.itemCount}</div>
        </div>
        <div className="h-8 w-px bg-slate-150 dark:bg-slate-800" />
        <div className="min-w-[48px]">
          <div className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{t("advanced.ack.attachedLabel")}</div>
          <div className="text-xs font-extrabold text-slate-700 dark:text-slate-355 mt-1">{b.committedCount}</div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 border-slate-50 dark:border-slate-855 pt-3.5 sm:pt-0 shrink-0">
        <span className="text-[10px] text-slate-455 font-bold sm:hidden">
          {pending > 0 ? t("advanced.ack.itemsPending", { count: pending }) : t("advanced.ack.allItemsProcessed")}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-455 font-bold hidden sm:inline">
            {pending > 0 ? t("advanced.ack.itemsPending", { count: pending }) : t("advanced.ack.allItemsProcessed")}
          </span>

          <div className="flex items-center gap-2">
            {/* Delete / Stop button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={loading}
              className={`h-8 text-xs font-bold px-3 gap-1 rounded-lg border-slate-200 dark:border-slate-800 dark:bg-slate-950 cursor-pointer transition-colors duration-200 ${
                isActive
                  ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-955/20 border-amber-200/50 dark:border-amber-950/30"
                  : "text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 border-rose-200/50 dark:border-rose-950/30"
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

            <Button size="sm" variant="outline" className="h-8 text-xs font-bold px-3 gap-1.5 rounded-lg shadow-3xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850" asChild>
              <Link href={`/complaints/acknowledgments/${b.id}`}>
                {b.status === "committed" ? t("advanced.ack.viewBatch") : t("advanced.ack.reviewAndMatch")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
