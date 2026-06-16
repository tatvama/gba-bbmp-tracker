"use server";

import { requireRole, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { extractBillStructure } from "@/lib/ai/bill-extractor";
import { runBillRules, scoreFindings } from "@/lib/forensics/rule-engine";
import { checkRates, type SrRate } from "@/lib/forensics/rate-check";
import type { BillFinding, StructuredBill } from "@/lib/forensics/types";

export interface BillAuditItem {
  documentId: string;
  documentType: string | null;
  bill: StructuredBill;
  findings: BillFinding[];
  score: number;
  redFlagCount: number;
}
export interface BillAuditResult {
  ok: boolean;
  error?: string;
  audits: BillAuditItem[];
}

const FINANCIAL = ["bill", "mb book", "measurement", "estimate", "work order"];

/** Structured + deterministic + rate audit of a complaint's financial documents. */
export async function auditComplaintBills(complaintId: string): Promise<BillAuditResult> {
  let user;
  try {
    user = await requireRole(COMPLAINT_VERIFY_ROLES);
  } catch (e) {
    return { ok: false, error: e instanceof AuthorizationError ? e.message : "Not authorized", audits: [] };
  }

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("complaint_documents")
    .select("id, document_type, ocr_clean_text, ocr_raw_text")
    .eq("complaint_id", complaintId);

  const withText = (docs ?? [])
    .map((d) => ({
      id: d.id as string,
      type: (d.document_type as string) ?? null,
      ocr: ((d.ocr_clean_text as string) || (d.ocr_raw_text as string) || "").trim(),
    }))
    .filter((d) => d.ocr.length > 12);

  // Prefer financial documents; fall back to all OCR'd docs if none are tagged.
  const financial = withText.filter((d) => FINANCIAL.some((k) => (d.type ?? "").toLowerCase().includes(k)));
  const targets = financial.length ? financial : withText;
  if (targets.length === 0) {
    return { ok: false, error: "No OCR'd bill/MB documents on this case. Upload and run OCR first.", audits: [] };
  }

  // Rate book.
  const { data: sr } = await admin.from("sr_rates").select("sr_code, description, unit, rate, sr_year").limit(5000);
  const book: SrRate[] = (sr ?? []).map((r) => ({
    srCode: (r.sr_code as string) ?? null,
    description: (r.description as string) ?? "",
    unit: (r.unit as string) ?? null,
    rate: Number(r.rate),
    srYear: (r.sr_year as string) ?? null,
  }));

  const audits: BillAuditItem[] = [];
  for (const d of targets) {
    const ex = await extractBillStructure(d.ocr);
    const findings = [...runBillRules(ex.bill), ...checkRates(ex.bill.lineItems, book)];
    const { score, redFlagCount } = scoreFindings(findings);
    audits.push({ documentId: d.id, documentType: d.type, bill: ex.bill, findings, score, redFlagCount });

    await admin.from("bill_audits").insert({
      complaint_id: complaintId,
      document_id: d.id,
      source: "document",
      extracted: ex.bill,
      findings,
      grand_total: ex.bill.grandTotal ?? null,
      red_flag_count: redFlagCount,
      score,
      confidence: ex.bill.confidence ?? null,
      created_by: user.id,
    });
  }

  return { ok: true, audits };
}
