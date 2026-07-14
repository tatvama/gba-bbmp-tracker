"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DocumentUpload } from "@/components/complaints/document-upload";
import { useTranslation } from "@/lib/i18n/client";

type C = { id: string; title: string; internal_case_number: string | null };

const selectCls = "flex h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MobileUpload({ complaints, aiConfigured }: { complaints: C[]; aiConfigured: boolean }) {
  const [id, setId] = React.useState("");
  const { t } = useTranslation("complaints");

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>{t("form.selectComplaintLabel")}</Label>
        <select className={selectCls} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">{t("form.chooseComplaintOption")}</option>
          {complaints.map((c) => (
            <option key={c.id} value={c.id}>{c.internal_case_number ? `${c.internal_case_number} · ` : ""}{c.title}</option>
          ))}
        </select>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href="/complaints/mobile/new"><Plus className="h-4 w-4" /> {t("form.createQuickComplaintLink")}</Link>
        </Button>
      </div>

      {id ? (
        <DocumentUpload complaintId={id} aiConfigured={aiConfigured} />
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("form.chooseComplaintPrompt")}
        </p>
      )}
    </div>
  );
}
