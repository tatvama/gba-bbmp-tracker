import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeName } from "@/lib/storage/supabase-upload";

/** Lowercase, hyphenated slug of a document type (e.g. "Department reply" -> "department-reply"). */
export function slugifyDocType(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** File extension for an upload, from its MIME type first, then its original name. */
export function extFromUpload(mime: string, originalName: string): string {
  if (MIME_EXT[mime]) return MIME_EXT[mime]!;
  const dot = originalName.lastIndexOf(".");
  const fromName = dot > 0 ? originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return fromName || "bin";
}

/**
 * The display/stored file name for an uploaded complaint document:
 * "<job number or case number>_<document type>[-n].<ext>" — e.g.
 * "206-24-000004_department-reply.pdf". Falls back to the complaint's
 * internal case number when no BBMP job number is linked, and further to a
 * short id fragment when neither exists, so the name is never blank.
 *
 * Only appends a "-n" disambiguator when a document of the SAME type already
 * exists on this complaint, so the first upload of a kind gets the clean,
 * unsuffixed name — later ones of the same type (e.g. a second department
 * reply) don't silently look identical in the document list.
 */
export async function buildComplaintDocumentFileName(
  admin: SupabaseClient,
  complaintId: string,
  docType: string,
  ext: string,
): Promise<string> {
  const { data: c } = await admin
    .from("complaints")
    .select("job_number, internal_case_number")
    .eq("id", complaintId)
    .maybeSingle();
  const row = c as { job_number?: string | null; internal_case_number?: string | null } | null;
  const idPart = row?.job_number?.trim() || row?.internal_case_number?.trim() || complaintId.slice(0, 8);

  const { count } = await admin
    .from("complaint_documents")
    .select("id", { count: "exact", head: true })
    .eq("complaint_id", complaintId)
    .eq("document_type", docType);

  const base = safeName(`${idPart}_${slugifyDocType(docType)}`);
  const n = (count ?? 0) + 1;
  return n > 1 ? `${base}-${n}.${ext}` : `${base}.${ext}`;
}
