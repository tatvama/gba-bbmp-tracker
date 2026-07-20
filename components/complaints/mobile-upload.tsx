"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/complaints/document-upload";
import { ScanCapture } from "@/components/complaints/scan-capture";
import { COMPLAINT_DOCUMENT_TYPES } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/client";

type C = { id: string; title: string; internal_case_number: string | null };

const selectCls = "flex h-12 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// "Scan a document" merges every captured page into ONE PDF (see ScanCapture) —
// that only makes sense for a paper document, never for site/evidence photos,
// which must stay as separate images so per-photo duplicate/geofence checks
// keep working. Site photo types are therefore reserved for the other tab.
const SCAN_DOC_TYPES = COMPLAINT_DOCUMENT_TYPES.filter((t) => !t.startsWith("Site photo"));

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
        <Tabs defaultValue="scan">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scan">Scan a document</TabsTrigger>
            <TabsTrigger value="photos">Site / evidence photos</TabsTrigger>
          </TabsList>
          <TabsContent value="scan" className="pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Capture one page at a time — every page merges into a single PDF, named from this case&apos;s job/case number and the document type.
            </p>
            <ScanCapture complaintId={id} docTypes={SCAN_DOC_TYPES} defaultDocType="Original complaint copy" />
          </TabsContent>
          <TabsContent value="photos" className="pt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Each photo is kept as its own document (needed for duplicate-photo and location checks) — nothing here is merged.
            </p>
            <DocumentUpload complaintId={id} aiConfigured={aiConfigured} />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("form.chooseComplaintPrompt")}
        </p>
      )}
    </div>
  );
}
