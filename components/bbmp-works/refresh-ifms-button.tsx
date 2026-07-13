"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshWorkFromIfms } from "@/lib/actions/bbmp-sources";

/** Small client wrapper around the `refreshWorkFromIfms` server action. No
 *  toast library exists in this project (checked), so it just disables the
 *  button while pending and shows inline error text on failure. */
export function RefreshIfmsButton({ jobNumber }: { jobNumber: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function refresh() {
    setError(null);
    startTransition(async () => {
      const res = await refreshWorkFromIfms(jobNumber);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" size="sm" variant="outline" disabled={pending} loading={pending} onClick={refresh}>
        <RefreshCw className="h-3.5 w-3.5" /> Refresh from IFMS
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
