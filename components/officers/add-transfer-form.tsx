"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addOfficerTransfer } from "@/lib/actions/officers";
import type { ActionState } from "@/lib/actions/contacts";

export function AddTransferForm({ officerId }: { officerId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const action = addOfficerTransfer.bind(null, officerId);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  React.useEffect(() => {
    if (state.success) {
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add transfer
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-card p-4">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {state.error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="newCorporation" className="mb-1 block text-xs font-medium">New corporation</Label>
          <Input id="newCorporation" name="newCorporation" placeholder="e.g. Bengaluru East" />
        </div>
        <div>
          <Label htmlFor="newDivision" className="mb-1 block text-xs font-medium">New division</Label>
          <Input id="newDivision" name="newDivision" />
        </div>
        <div>
          <Label htmlFor="newSubdivision" className="mb-1 block text-xs font-medium">New sub-division</Label>
          <Input id="newSubdivision" name="newSubdivision" />
        </div>
        <div>
          <Label htmlFor="newWard" className="mb-1 block text-xs font-medium">New ward</Label>
          <Input id="newWard" name="newWard" />
        </div>
        <div>
          <Label htmlFor="effectiveDate" className="mb-1 block text-xs font-medium">Effective date</Label>
          <Input id="effectiveDate" name="effectiveDate" type="date" />
        </div>
        <div>
          <Label htmlFor="transferOrderNo" className="mb-1 block text-xs font-medium">Transfer order no.</Label>
          <Input id="transferOrderNo" name="transferOrderNo" />
        </div>
      </div>
      <div>
        <Label htmlFor="notes" className="mb-1 block text-xs font-medium">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save transfer
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
