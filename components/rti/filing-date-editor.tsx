"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateRtiFilingDateAction } from "@/lib/actions/rti";

import { formatDate } from "@/lib/format";

function fmt(d: string | null): string {
  if (!d) return "—";
  return formatDate(d);
}

/**
 * Inline editor for the RTI filing date. Saving recomputes the statutory
 * deadlines server-side (updateRtiFilingDateAction) and refreshes the page.
 */
export function FilingDateEditor({
  rtiId,
  dateFiled,
  canEdit,
}: {
  rtiId: string;
  dateFiled: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(dateFiled ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const res = await updateRtiFilingDateAction(rtiId, value || null);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!canEdit) return <span>{fmt(dateFiled)}</span>;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        {fmt(dateFiled)}
        <button
          type="button"
          onClick={() => {
            setValue(dateFiled ?? "");
            setEditing(true);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Edit filing date"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-40"
        aria-label="Filing date"
      />
      <Button type="button" size="sm" className="h-8 px-2" disabled={busy} onClick={save}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditing(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
