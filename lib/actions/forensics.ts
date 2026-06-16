"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { analyzeBillForensics, type BillForensics } from "@/lib/ai/bill-forensics";

export interface ForensicsActionResult {
  ok: boolean;
  forensics?: BillForensics;
  error?: string;
  documentCount?: number;
}

/** Run cross-document bill/MB forensics over a complaint's OCR'd documents. */
export async function runBillForensics(complaintId: string): Promise<ForensicsActionResult> {
  try {
    await requireRole(COMPLAINT_VERIFY_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized" };
  }

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("complaints")
    .select("internal_case_number, title, job_number, location, contractor")
    .eq("id", complaintId)
    .maybeSingle();
  const { data: docs } = await admin
    .from("complaint_documents")
    .select("document_type, ocr_clean_text, ocr_raw_text")
    .eq("complaint_id", complaintId);

  const documents = (docs ?? [])
    .map((d) => ({
      type: (d.document_type as string) ?? "Document",
      ocrText: ((d.ocr_clean_text as string) || (d.ocr_raw_text as string) || "").trim(),
    }))
    .filter((d) => d.ocrText.length > 8);

  if (documents.length === 0) {
    return { ok: false, error: "No OCR'd documents on this case. Upload bill/MB/work-order and run OCR first.", documentCount: 0 };
  }

  const context = c
    ? [
        `Case ${c.internal_case_number ?? "—"}: ${c.title}`,
        c.job_number ? `Job: ${c.job_number}` : "",
        c.location ? `Road: ${c.location}` : "",
        c.contractor ? `Contractor: ${c.contractor}` : "",
      ].filter(Boolean).join("\n")
    : "";

  const res = await analyzeBillForensics({ documents, context });
  return { ok: res.ok, forensics: res.forensics, error: res.error, documentCount: documents.length };
}
