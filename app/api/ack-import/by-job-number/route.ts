import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { validateUpload } from "@/lib/storage/supabase-upload";
import { getComplaintSettings } from "@/lib/settings";
import { extractJobCode } from "@/lib/ifms/downloader";
import { attachAcknowledgmentDocument } from "@/lib/complaints/ack-attach";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Attach individually-scanned acknowledgment files whose FILENAME carries the
 * job number (e.g. "047-25-000003.pdf") straight to the matching complaint —
 * deterministic filename→job_number lookup, no AI/OCR matching. Alongside
 * (not replacing) the AI-driven bulk mixed-PDF flow at /api/ack-import for
 * scans that don't arrive pre-separated. Runs synchronously since matching is
 * instant — no batch/progress polling needed.
 *
 * Matches with a direct, indexed `job_number` lookup per file (idx_complaints_
 * job_number) rather than pulling the whole complaint pool into memory and
 * filtering client-side — that pool used to be capped at an unordered
 * `LIMIT 5000` (lib/complaints/ack-matcher.ts), so once the table grew past
 * that a complaint could silently fall outside the window and never match,
 * with no visible error. A per-code indexed query has no such ceiling.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  }

  const settings = await getComplaintSettings();
  const maxBytes = (settings.maxUploadMb || 15) * 1024 * 1024;
  const admin = createAdminClient();

  const attached: { fileName: string; complaintId: string; caseNumber: string | null; jobNumber: string }[] = [];
  const unmatched: { fileName: string; jobNumber: string }[] = [];
  const ambiguous: { fileName: string; jobNumber: string; candidates: { complaintId: string; caseNumber: string | null; title: string | null }[] }[] = [];
  const invalid: { fileName: string; reason: string }[] = [];

  for (const file of files) {
    const code = extractJobCode(file.name);
    if (!code) {
      invalid.push({ fileName: file.name, reason: "No job number (ddd-yy-nnnnnn) found in the file name." });
      continue;
    }
    const mime = file.type || "application/octet-stream";
    const check = validateUpload(mime, file.size, maxBytes);
    if (!check.ok) {
      invalid.push({ fileName: file.name, reason: check.error || "Invalid file." });
      continue;
    }

    // Exact match first (fast, uses idx_complaints_job_number) — covers every
    // complaint created through the ZIP/IFMS import pipelines, which always
    // write the bare canonical code. Complaints created by hand have a free-
    // text job_number field (no format enforcement), so a value like
    // "Job 047-25-000003" or one with stray whitespace wouldn't hit the exact
    // match — fall back to a substring scan, re-verified with the same
    // extractJobCode used everywhere else so an incidental digit-run overlap
    // can't produce a false match.
    let candidates: { id: string; internal_case_number: string | null; title: string | null }[] | null = null;
    const exact = await admin
      .from("complaints")
      .select("id, internal_case_number, title")
      .eq("job_number", code)
      .is("deleted_at", null);
    if (exact.error) {
      invalid.push({ fileName: file.name, reason: `Lookup failed: ${exact.error.message}` });
      continue;
    }
    if (exact.data.length > 0) {
      candidates = exact.data;
    } else {
      const fuzzy = await admin
        .from("complaints")
        .select("id, internal_case_number, title, job_number")
        .ilike("job_number", `%${code}%`)
        .is("deleted_at", null);
      if (fuzzy.error) {
        invalid.push({ fileName: file.name, reason: `Lookup failed: ${fuzzy.error.message}` });
        continue;
      }
      candidates = fuzzy.data.filter((c) => extractJobCode(c.job_number) === code);
    }
    if (candidates.length === 0) {
      unmatched.push({ fileName: file.name, jobNumber: code });
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({
        fileName: file.name,
        jobNumber: code,
        candidates: candidates.map((c) => ({ complaintId: c.id, caseNumber: c.internal_case_number, title: c.title })),
      });
      continue;
    }

    const complaint = candidates[0]!;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await attachAcknowledgmentDocument(admin, {
        complaintId: complaint.id,
        buffer,
        fileName: file.name,
        mimeType: mime,
        userId: user.id,
        timelineTitle: "Acknowledgment attached by job number match",
        timelineSummary: `Matched from uploaded file "${file.name}" by job number ${code}`,
        runOcrJob: settings.ocrAutoRun,
      });
      attached.push({ fileName: file.name, complaintId: complaint.id, caseNumber: complaint.internal_case_number, jobNumber: code });
    } catch (e) {
      console.error("[ackByJobNumber] attach failed", file.name, e);
      invalid.push({ fileName: file.name, reason: e instanceof Error ? e.message : "Attach failed." });
    }
  }

  if (attached.length) {
    revalidatePath("/complaints");
    for (const a of attached) revalidatePath(`/complaints/${a.complaintId}`);
  }

  return NextResponse.json({ attached, unmatched, ambiguous, invalid });
}
