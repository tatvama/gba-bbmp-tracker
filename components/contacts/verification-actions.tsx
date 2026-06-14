"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VERIFICATION_STATUSES, VERIFICATION_LABEL, type VerificationStatus } from "@/lib/constants";
import { setContactVerification } from "@/lib/actions/contacts";

export function VerificationActions({
  contactId,
  current,
}: {
  contactId: string;
  current: VerificationStatus;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function apply(status: string) {
    setError(null);
    startTransition(async () => {
      const res = await setContactVerification(contactId, status, note);
      if (res.error) setError(res.error);
      else {
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <Input
        placeholder="Optional note (recorded in internal notes + audit log)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mb-3"
      />
      <div className="flex flex-wrap gap-2">
        {VERIFICATION_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === current ? "default" : "outline"}
            disabled={pending}
            onClick={() => apply(s)}
          >
            {VERIFICATION_LABEL[s]}
          </Button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
