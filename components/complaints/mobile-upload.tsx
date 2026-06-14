"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DocumentUpload } from "@/components/complaints/document-upload";

type C = { id: string; title: string; internal_case_number: string | null };

const selectCls = "flex h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MobileUpload({ complaints, aiConfigured }: { complaints: C[]; aiConfigured: boolean }) {
  const [id, setId] = React.useState("");

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Select complaint</Label>
        <select className={selectCls} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">— choose a complaint —</option>
          {complaints.map((c) => (
            <option key={c.id} value={c.id}>{c.internal_case_number ? `${c.internal_case_number} · ` : ""}{c.title}</option>
          ))}
        </select>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/complaints/mobile/new"><Plus className="h-4 w-4" /> Create a new quick complaint</Link>
        </Button>
      </div>

      {id ? (
        <DocumentUpload complaintId={id} aiConfigured={aiConfigured} />
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Choose a complaint above, then capture or upload paper photos.
        </p>
      )}
    </div>
  );
}
