import "server-only";
import { createHash } from "node:crypto";
import type { DbClient } from "@/lib/db";
import { R2_STORAGE_SENTINEL, type CorporationCode } from "@/lib/constants";
import { corporationAddressedRoleKeys, officeCopyRoleKeys, type RecipientRoleKey } from "@/lib/complaints/recipient-roles";
import { DOCUMENT_VARIANTS } from "./document-variants";
import { applyCopyTo, buildCopyToBlock, officeCopyBody, toRecipientList, type RecipientEnrichment } from "./copy-to";
import { corporationOfficeAddress, tvccAddresseeBlock, tvccRecipientSnapshot, TVCC_OFFICES, type TvccOffice } from "./tvcc";
import { readdressLetterToTvcc } from "./tvcc-copy";
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
  admin: DbClient;
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
  /** When set, ALSO render a separate copy re-addressed to this division's TVCC
   *  and link it to the recipient copy (best-effort — never blocks the filing). */
  tvccDivision?: CorporationCode | null;
  tvccLanguage?: string | null; // language for the TVCC addressee block ("en" default)
  /** The resolved (saved-or-seed) office for tvccDivision; seed used if omitted. */
  tvccOffice?: TvccOffice | null;
  /** When set, the zonal Copy-To officers (Commissioner / Chief Engineer / EE /
   *  AEE) are addressed to this GBA city-corporation's office — its postal
   *  address is stamped onto their Copy-To (and the office copy) lines. */
  zonalDivision?: CorporationCode | null;
  zonalLanguage?: string | null; // language for the stamped corporation address ("en" default)
  /** The resolved (saved-or-seed) office for zonalDivision; seed used if omitted. */
  zonalOffice?: TvccOffice | null;
}

export interface FileLetterResult {
  recipientDocId: string;
  officeCopyDocId: string | null;
  /** The re-addressed TVCC copy id, when a tvccDivision was requested and it rendered. */
  tvccCopyDocId: string | null;
  /** Recipient-copy markdown (Copy-To applied) — for the caller's ai_drafts row. */
  recipientContent: string;
}

/** Deps needed to render + store a variant PDF (subset of DistributionDeps). */
type VariantDeps = Pick<DistributionDeps, "admin" | "storage" | "render">;

/**
 * Render a letter re-addressed to a division's TVCC and store it as a
 * `tvcc_copy` variant linked to `parentDocumentId`. Throws on failure so the
 * standalone Submit-stage action can surface it; the follow-up path wraps this
 * best-effort so a TVCC hiccup never loses the primary letter.
 */
export async function fileTvccCopy(
  deps: VariantDeps,
  input: {
    complaintId: string;
    baseContent?: string; // the letter markdown to re-address (no Copy-To applied)
    /** Final letter content already addressed to the TVCC (e.g. AI-drafted) —
     *  when set, it is stored as-is and re-addressing is skipped. */
    contentOverride?: string;
    title: string;
    reference?: string | null;
    division: CorporationCode;
    office?: TvccOffice | null; // resolved (saved-or-seed) address; seed used if omitted
    language?: string | null;
    parentDocumentId?: string | null;
    uploadedBy: string | null;
  },
): Promise<{ tvccCopyDocId: string; readdressed: boolean }> {
  const office = input.office ?? TVCC_OFFICES[input.division];
  const { content, readdressed } =
    input.contentOverride != null
      ? { content: input.contentOverride, readdressed: true }
      : readdressLetterToTvcc(input.baseContent ?? "", tvccAddresseeBlock(office, input.language ?? null));
  const pdf = await deps.render(`${input.title} (TVCC Copy)`, content, { reference: input.reference ?? null });

  const key = `complaints/${input.complaintId}/tvcc-copy-${input.division.toLowerCase()}-${Date.now()}.pdf`;
  await deps.storage.upload({ key, body: pdf.buffer, contentType: "application/pdf", contentLength: pdf.buffer.byteLength });
  const { data, error } = await deps.admin
    .from("complaint_documents")
    .insert({
      complaint_id: input.complaintId,
      document_type: DOCUMENT_VARIANTS.tvcc_copy.documentType,
      title: `${input.title} — TVCC copy`,
      original_file_name: key.split("/").pop(),
      storage_bucket: R2_STORAGE_SENTINEL,
      storage_path: key,
      mime_type: "application/pdf",
      file_size: pdf.buffer.byteLength,
      file_sha256: sha256(pdf.buffer),
      document_date: todayISO(),
      ocr_status: "Skipped",
      ocr_clean_text: content,
      ai_summary_status: "none",
      uploaded_by: input.uploadedBy,
      doc_variant: "tvcc_copy",
      parent_document_id: input.parentDocumentId ?? null,
      copy_to: [tvccRecipientSnapshot(office, input.language ?? null)],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not store the TVCC copy.");
  return { tvccCopyDocId: data.id as string, readdressed };
}

export async function fileLetterWithCopies(deps: DistributionDeps, input: FileLetterInput): Promise<FileLetterResult> {
  const recipients = input.recipients ?? [];
  const enrich: RecipientEnrichment = await deps.resolve(input.complaintId).catch(() => ({}));

  // Stamp the chosen GBA city-corporation office address onto every zone &
  // division officer (Commissioner / Chief Engineer / Deputy Controller / EE /
  // AEE) — overriding the resolver's per-complaint guess. Applies to both the
  // recipient copy and the office copy since both render from `enrich`.
  if (input.zonalDivision) {
    const office = input.zonalOffice ?? TVCC_OFFICES[input.zonalDivision];
    const address = corporationOfficeAddress(office, input.zonalLanguage ?? null);
    for (const key of corporationAddressedRoleKeys()) {
      const existing = enrich[key];
      enrich[key] = { name: existing?.name ?? null, designation: existing?.designation ?? null, office: address, address };
    }
  }

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

  // 3) TVCC copy — optional, re-addressed to the chosen division. Best-effort
  // AFTER the primary is safe (same principle as the office copy).
  let tvccCopyDocId: string | null = null;
  if (input.tvccDivision) {
    try {
      const r = await fileTvccCopy(
        { admin: deps.admin, storage: deps.storage, render: deps.render },
        {
          complaintId: input.complaintId,
          baseContent: input.content,
          title: input.title,
          reference: input.reference ?? null,
          division: input.tvccDivision,
          office: input.tvccOffice ?? null,
          language: input.tvccLanguage ?? null,
          parentDocumentId: recipientDocId,
          uploadedBy: input.uploadedBy,
        },
      );
      tvccCopyDocId = r.tvccCopyDocId;
    } catch (e) {
      console.error("[distribution] TVCC copy failed (filed letter kept)", input.complaintId, e);
    }
  }

  return { recipientDocId, officeCopyDocId, tvccCopyDocId, recipientContent };
}
