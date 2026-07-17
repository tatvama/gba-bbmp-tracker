import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { R2_STORAGE_SENTINEL } from "@/lib/constants";
import { officeCopyRoleKeys, type RecipientRoleKey } from "@/lib/complaints/recipient-roles";
import { DOCUMENT_VARIANTS } from "./document-variants";
import { applyCopyTo, buildCopyToBlock, officeCopyBody, toRecipientList, type RecipientEnrichment } from "./copy-to";
import type { StoragePort, VariantRenderer, RecipientResolver } from "./ports";

/**
 * Document Distribution service (SIDE-EFFECT-FREE, per ARB R4). It renders a
 * filed letter into its variants (recipient copy + mandatory office copy),
 * stores both as linked complaint_documents rows, and RETURNS the ids. It does
 * NOT fire complaint side effects (timeline / escalation / advisor / ai_drafts)
 * — the calling complaint action owns those. Depends only on injected ports
 * (R1), so it is unit-testable without R2 / Puppeteer / the AI stack.
 */

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const todayISO = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => (s || "letter").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface DistributionDeps {
  admin: SupabaseClient;
  storage: StoragePort;
  render: VariantRenderer;
  resolve: RecipientResolver;
}

export interface FileLetterInput {
  complaintId: string;
  documentType: string; // recipient copy's document_type, e.g. "Counter-reply"
  title: string;
  content: string; // edited letter markdown (as filed today)
  reference?: string | null; // internal case number → QR/reference header
  recipients?: RecipientRoleKey[]; // selected Copy-To roles (optional → none)
  uploadedBy: string | null;
  aiSummaryStatus?: string; // "generating" | "none"
}

export interface FileLetterResult {
  recipientDocId: string;
  officeCopyDocId: string | null;
  /** Recipient-copy markdown (Copy-To applied) — for the caller's ai_drafts row. */
  recipientContent: string;
}

export async function fileLetterWithCopies(deps: DistributionDeps, input: FileLetterInput): Promise<FileLetterResult> {
  const recipients = input.recipients ?? [];
  const enrich: RecipientEnrichment = await deps.resolve(input.complaintId).catch(() => ({}));

  const recipientContent = applyCopyTo(input.content, buildCopyToBlock(recipients, enrich));
  const officeContent = officeCopyBody(input.content, enrich);

  // Render BOTH variants before any write, so a render failure aborts with no
  // partial state. Independent → parallel.
  const [recipientPdf, officePdf] = await Promise.all([
    deps.render(input.title, recipientContent, { reference: input.reference ?? null }),
    deps.render(`${input.title} (Office Copy)`, officeContent, { reference: input.reference ?? null }),
  ]);

  const stamp = Date.now();

  // 1) Recipient copy — the filed letter (primary). Must succeed.
  const recipientKey = `complaints/${input.complaintId}/${slug(input.documentType)}-${stamp}.pdf`;
  await deps.storage.upload({ key: recipientKey, body: recipientPdf.buffer, contentType: "application/pdf", contentLength: recipientPdf.buffer.byteLength });
  const { data: recDoc, error: recErr } = await deps.admin
    .from("complaint_documents")
    .insert({
      complaint_id: input.complaintId,
      document_type: input.documentType,
      title: input.title,
      original_file_name: recipientKey.split("/").pop(),
      storage_bucket: R2_STORAGE_SENTINEL,
      storage_path: recipientKey,
      mime_type: "application/pdf",
      file_size: recipientPdf.buffer.byteLength,
      file_sha256: sha256(recipientPdf.buffer),
      document_date: todayISO(),
      ocr_status: "Skipped",
      ocr_clean_text: recipientContent,
      ai_summary_status: input.aiSummaryStatus ?? "none",
      uploaded_by: input.uploadedBy,
      doc_variant: "recipient",
      recipients: { roles: recipients, enrichment: enrich },
      copy_to: toRecipientList(recipients, enrich),
    })
    .select("id")
    .single();
  if (recErr || !recDoc) throw new Error(recErr?.message ?? "Could not store the recipient copy.");
  const recipientDocId = recDoc.id as string;

  // 2) Office copy — mandatory but best-effort AFTER the primary is safe: never
  // lose the filed letter to an office-copy hiccup (it is regenerable).
  let officeCopyDocId: string | null = null;
  try {
    const officeKey = `complaints/${input.complaintId}/office-copy-${stamp}.pdf`;
    await deps.storage.upload({ key: officeKey, body: officePdf.buffer, contentType: "application/pdf", contentLength: officePdf.buffer.byteLength });
    const { data: offDoc } = await deps.admin
      .from("complaint_documents")
      .insert({
        complaint_id: input.complaintId,
        document_type: DOCUMENT_VARIANTS.office.documentType,
        title: `${input.title} (Office Copy)`,
        original_file_name: officeKey.split("/").pop(),
        storage_bucket: R2_STORAGE_SENTINEL,
        storage_path: officeKey,
        mime_type: "application/pdf",
        file_size: officePdf.buffer.byteLength,
        file_sha256: sha256(officePdf.buffer),
        document_date: todayISO(),
        ocr_status: "Skipped",
        ocr_clean_text: officeContent,
        ai_summary_status: "none",
        uploaded_by: input.uploadedBy,
        doc_variant: "office",
        parent_document_id: recipientDocId,
        copy_to: toRecipientList(officeCopyRoleKeys(), enrich),
      })
      .select("id")
      .single();
    officeCopyDocId = (offDoc?.id as string) ?? null;
  } catch (e) {
    console.error("[distribution] office copy failed (filed letter kept)", input.complaintId, e);
  }

  return { recipientDocId, officeCopyDocId, recipientContent };
}
