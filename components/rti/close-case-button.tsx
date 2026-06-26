"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { closeRtiCaseAction, reopenRtiCaseAction } from "@/lib/actions/rti";

/**
 * Close / reopen an RTI case.
 *
 * The "Close case" button is enabled only once an official response/order
 * document exists (Reply, FAA Order, Second Appeal Order or Higher Appeal
 * Order). With just an Application / Acknowledgement on file it stays disabled.
 */
export function CloseCaseButton({
  rtiId,
  status,
  canClose,
}: {
  rtiId: string;
  status: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const closed = status === "Closed";

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  if (closed) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => run(() => reopenRtiCaseAction(rtiId))}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        Reopen case
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy || !canClose}
      title={
        canClose
          ? "Close this RTI case"
          : "Upload a reply or an appeal order before closing this case."
      }
      onClick={() => {
        if (!confirm("Close this RTI case? You can reopen it later.")) return;
        void run(() => closeRtiCaseAction(rtiId));
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      Close case
    </Button>
  );
}
