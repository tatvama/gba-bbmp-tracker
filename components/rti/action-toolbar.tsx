import * as React from "react";
import { CheckCircle2, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionToolbarProps {
  canEdit: boolean;
  isPending: boolean;
  onConfirmFiled: () => void;
  onReRunVerification: () => void;
  onReplaceUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAcknowledgement: () => void;
}

export function ActionToolbar({
  canEdit,
  isPending,
  onConfirmFiled,
  onReRunVerification,
  onReplaceUpload,
  onDeleteAcknowledgement,
}: ActionToolbarProps) {
  const [activeAction, setActiveAction] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isPending) {
      setActiveAction(null);
    }
  }, [isPending]);

  const triggerConfirm = () => {
    setActiveAction("confirm");
    onConfirmFiled();
  };

  const triggerReRun = () => {
    setActiveAction("rerun");
    onReRunVerification();
  };

  const triggerDelete = () => {
    setActiveAction("delete");
    onDeleteAcknowledgement();
  };

  const triggerReplace = (e: React.ChangeEvent<HTMLInputElement>) => {
    setActiveAction("replace");
    onReplaceUpload(e);
  };

  if (!canEdit) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 w-full border-t border-slate-100 dark:border-slate-800/80 mt-4">
      {/* 1. Confirm Filed Button */}
      <Button
        type="button"
        onClick={triggerConfirm}
        disabled={isPending}
        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold h-8.5 px-3.5 shadow-sm transition-all rounded-md disabled:opacity-50"
      >
        {isPending && activeAction === "confirm" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        <span>Confirm & Mark as Filed</span>
      </Button>

      {/* 2. Re-run Verification */}
      <Button
        type="button"
        variant="outline"
        onClick={triggerReRun}
        disabled={isPending}
        className="gap-1.5 text-xs font-semibold h-8.5 px-3.5 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all rounded-md disabled:opacity-50"
      >
        {isPending && activeAction === "rerun" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span>Re-run Verification</span>
      </Button>

      {/* 3. Replace File */}
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          className="gap-1.5 text-xs font-semibold h-8.5 px-3.5 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all rounded-md disabled:opacity-50 pointer-events-none"
        >
          {isPending && activeAction === "replace" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span>Replace File</span>
        </Button>
        {!isPending && (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={triggerReplace}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Replace acknowledgement file"
          />
        )}
      </div>

      {/* 4. Delete/Clear Acknowledgement */}
      <Button
        type="button"
        variant="ghost"
        onClick={triggerDelete}
        disabled={isPending}
        className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 gap-1.5 text-xs font-semibold h-8.5 px-3.5 transition-all rounded-md disabled:opacity-50"
      >
        {isPending && activeAction === "delete" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        <span>Delete Acknowledgement</span>
      </Button>
    </div>
  );
}
