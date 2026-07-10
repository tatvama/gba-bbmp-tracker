"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { clearCompletedAckBatchesAction } from "@/lib/actions/ack-import";

/** Bulk-clears every FINISHED (attached or failed) acknowledgment batch from the
 *  history list — mirrors the import queue's "Clear Completed". Leaves anything
 *  still processing or awaiting review untouched. */
export function AckClearCompletedButton({ clearableCount }: { clearableCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (clearableCount === 0) return;
    if (!window.confirm(`Clear ${clearableCount} completed batch${clearableCount === 1 ? "" : "es"} from history? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await clearCompletedAckBatchesAction();
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not clear history.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[10px] font-bold text-rose-600">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={busy || clearableCount === 0}
        className="h-8 text-xs font-bold px-3 gap-1.5 rounded-lg border-slate-200 dark:border-slate-800 dark:bg-slate-900 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        Clear Completed{clearableCount > 0 ? ` (${clearableCount})` : ""}
      </Button>
    </div>
  );
}
