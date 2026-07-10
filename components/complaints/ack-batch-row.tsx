"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, ArrowRight, Trash2, StopCircle, Loader2 } from "lucide-react";
import { deleteAckBatchAction } from "@/lib/actions/ack-import";
import { type AckBatchListRow } from "@/lib/complaints/ack-reconcile";

const STATUS_VARIANT: Record<string, string> = {
  processing: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/50",
  review: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/50",
  committing: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200/50",
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

export function AckBatchRow({ b }: { b: AckBatchListRow }) {
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
    const confirmMsg = isActive
      ? `Are you sure you want to stop processing and delete "${b.originalName || "acknowledgments.pdf"}"?`
      : `Are you sure you want to delete "${b.originalName || "acknowledgments.pdf"}" from history?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await deleteAckBatchAction(b.id);
      if (!res.ok) {
        setError(res.error || "Failed to delete batch");
        setLoading(false);
      }
    } catch (e) {
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 transition-all duration-200 p-4">
      {/* Left: Icon + File Details */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1 sm:max-w-xs md:max-w-md lg:max-w-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 text-slate-455">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-slate-850 dark:text-slate-250 truncate group-hover:text-primary transition-colors" title={b.originalName || "acknowledgments.pdf"}>
            {b.originalName || "acknowledgments.pdf"}
          </h4>
          <div className="flex items-center gap-2 text-[10px] text-slate-455 dark:text-slate-500 mt-1 font-semibold">
            <Calendar className="h-3 w-3" />
            <span>{dateStr}</span>
            {error && <span className="text-rose-600 font-bold">• {error}</span>}
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
        <span className="text-[10px] text-slate-455 font-bold sm:hidden">
          {pending > 0 ? `${pending} items pending` : "All items processed"}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-455 font-bold hidden sm:inline">
            {pending > 0 ? `${pending} items pending` : "All items processed"}
          </span>

          <div className="flex items-center gap-2">
            {/* Delete / Stop button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              disabled={loading}
              className={`h-8 text-xs font-bold px-3 gap-1 rounded-lg border-slate-200 dark:border-slate-800 dark:bg-slate-900 cursor-pointer ${
                isActive
                  ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-955/20"
                  : "text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-955/20"
              }`}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isActive ? (
                <StopCircle className="h-3.5 w-3.5" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {isActive ? "Stop" : "Delete"}
            </Button>

            <Button size="sm" variant="outline" className="h-8 text-xs font-bold px-3 gap-1 rounded-lg" asChild>
              <Link href={`/complaints/acknowledgments/${b.id}`}>
                {b.status === "committed" ? "View Batch" : "Review & Match"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
