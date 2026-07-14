"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { clearCompletedAckBatchesAction } from "@/lib/actions/ack-import";
import { useTranslation } from "@/lib/i18n/client";

/** Bulk-clears every FINISHED (attached or failed) acknowledgment batch from the
 *  history list — mirrors the import queue's "Clear Completed". Leaves anything
 *  still processing or awaiting review untouched. */
export function AckClearCompletedButton({ clearableCount }: { clearableCount: number }) {
  const router = useRouter();
  const { t } = useTranslation("complaints");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (clearableCount === 0) return;
    
    const confirmMsg = t("advanced.ack.clearConfirm", {
      count: clearableCount,
      plural: clearableCount === 1 ? "" : "es"
    });

    if (!window.confirm(confirmMsg)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await clearCompletedAckBatchesAction();
    setBusy(false);
    if (!res.ok) {
      setError(res.error || t("advanced.ack.clearHistoryFailed"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[10px] font-bold text-rose-650">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={busy || clearableCount === 0}
        className="h-8 text-xs font-bold px-3 gap-1.5 rounded-lg border-slate-205 dark:border-slate-800 dark:bg-slate-955 text-rose-600 hover:text-rose-700 hover:bg-rose-50/50 dark:hover:bg-rose-955/20 cursor-pointer transition-colors duration-200"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {t("advanced.ack.clearCompletedButton")}
        {clearableCount > 0 ? ` (${clearableCount})` : ""}
      </Button>
    </div>
  );
}
