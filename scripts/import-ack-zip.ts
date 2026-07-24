/**
 * CLI bulk import of scanned BBMP acknowledgment PDFs — the exact pipeline
 * POST /api/ack-import runs (merge → upload to R2 → processAckBatch), without
 * the browser upload step or its request-duration ceiling. Each input file
 * becomes its own reconciliation batch, left in `review` status: nothing is
 * attached to a complaint and no new complaint is created. Review/confirm in
 * the app at /complaints/acknowledgments/<batchId>, or pass --report to print
 * a match/no-match summary here.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-ack-zip.ts <pdf-or-folder> [more ...]
 *
 * Flags:
 *   --user <profile-id>   created_by for each batch (default: first ADMIN profile)
 *   --report              print a matched/unmatched summary per batch (JSON at the end)
 *
 * Requires .env with SUPABASE + R2 + ANTHROPIC credentials (same as the app).
 */
import path from "node:path";
import { readdir, stat, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadEnv } from "./db";

loadEnv();

async function collectPdfPaths(inputs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const input of inputs) {
    const p = path.resolve(input);
    const st = await stat(p);
    if (st.isDirectory()) {
      const entries = await readdir(p, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase().endsWith(".pdf")) out.push(path.join(p, e.name));
      }
    } else if (st.isFile() && p.toLowerCase().endsWith(".pdf")) {
      out.push(p);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

interface BatchSummary {
  file: string;
  batchId: string;
  pageCount: number;
  status: string;
  matched: { itemId: string; confidence: string; subject: string | null; caseNumber: string | null; complaintNumber: string | null }[];
  unmatched: { itemId: string; confidence: string; subject: string | null; jobNumber: string | null }[];
  skippedAlreadyAcked: number;
  error?: string;
}

async function main() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { buildMergedPdf } = await import("@/lib/pdf/merge");
  const { uploadToR2 } = await import("@/lib/storage/r2-upload");
  const { processAckBatch } = await import("@/lib/complaints/ack-runner");

  const args = process.argv.slice(2);
  const report = args.includes("--report");
  const userFlag = args.indexOf("--user");
  const userIdArg = userFlag >= 0 ? args[userFlag + 1] : undefined;
  const inputs = args.filter((a, i) => !a.startsWith("--") && (userFlag < 0 || i !== userFlag + 1));

  if (!inputs.length) {
    console.error(
      "Usage: npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/import-ack-zip.ts <pdf-or-folder> [more ...] [--user <profile-id>] [--report]",
    );
    process.exit(1);
  }

  const admin = createAdminClient();

  let userId = userIdArg;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id, role, email").eq("role", "ADMIN").limit(1);
    userId = data?.[0]?.id as string | undefined;
    if (!userId) {
      console.error("✗ No ADMIN profile found — pass --user <profile-id>.");
      process.exit(1);
    }
    console.log(`→ Importing as ${data?.[0]?.email ?? userId}`);
  }

  const pdfPaths = await collectPdfPaths(inputs);
  if (!pdfPaths.length) {
    console.error("✗ No PDF files found in the given paths.");
    process.exit(1);
  }
  console.log(`Found ${pdfPaths.length} PDF file(s) — processing each as its own batch.\n`);

  const summaries: BatchSummary[] = [];

  for (const pdfPath of pdfPaths) {
    const name = path.basename(pdfPath);
    console.log(`══ ${name} ══`);
    try {
      const buffer = await readFile(pdfPath);
      const { pdf, pageCount } = await buildMergedPdf([{ buffer, mimeType: "application/pdf" }]);
      const originalUrl = await uploadToR2({ key: `ack-imports/${randomUUID()}.pdf`, body: pdf, contentType: "application/pdf" });

      const { data, error } = await admin
        .from("ack_import_batches")
        .insert({
          status: "processing",
          stage: "Queued",
          message: "Waiting to start…",
          original_storage_path: originalUrl,
          original_name: name,
          page_count: pageCount,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message || "Could not create the batch.");
      const batchId = data.id as string;
      console.log(`  batch ${batchId} — ${pageCount} page(s), processing…`);

      await processAckBatch(batchId);

      const { data: batchRow } = await admin.from("ack_import_batches").select("status, message, error").eq("id", batchId).single();
      const status = (batchRow as { status?: string } | null)?.status ?? "unknown";
      if (status === "failed") {
        const err = (batchRow as { error?: string } | null)?.error ?? "unknown error";
        console.log(`  ✗ failed: ${err}`);
        summaries.push({ file: name, batchId, pageCount, status, matched: [], unmatched: [], skippedAlreadyAcked: 0, error: err });
        console.log("");
        continue;
      }

      const { data: items } = await admin
        .from("ack_import_items")
        .select("id, match_confidence, proposed_complaint_id, extracted, decision")
        .eq("batch_id", batchId)
        .order("sort_order", { ascending: true });
      const rows = (items ?? []) as {
        id: string;
        match_confidence: string;
        proposed_complaint_id: string | null;
        extracted: Record<string, unknown> | null;
        decision: string;
      }[];

      const complaintIds = [...new Set(rows.map((r) => r.proposed_complaint_id).filter(Boolean))] as string[];
      const complaintMap = new Map<string, { caseNumber: string | null; complaintNumber: string | null }>();
      if (complaintIds.length) {
        const { data: comps } = await admin.from("complaints").select("id, internal_case_number, complaint_number").in("id", complaintIds);
        for (const c of (comps ?? []) as { id: string; internal_case_number: string | null; complaint_number: string | null }[]) {
          complaintMap.set(c.id, { caseNumber: c.internal_case_number, complaintNumber: c.complaint_number });
        }
      }

      const matched: BatchSummary["matched"] = [];
      const unmatched: BatchSummary["unmatched"] = [];
      let skippedAlreadyAcked = 0;
      for (const r of rows) {
        const ex = (r.extracted ?? {}) as Record<string, unknown>;
        const subject = ex.subject ? String(ex.subject) : null;
        if (r.decision === "skipped") {
          skippedAlreadyAcked++;
          continue;
        }
        if (r.proposed_complaint_id) {
          const c = complaintMap.get(r.proposed_complaint_id);
          matched.push({
            itemId: r.id,
            confidence: r.match_confidence,
            subject,
            caseNumber: c?.caseNumber ?? null,
            complaintNumber: c?.complaintNumber ?? null,
          });
        } else {
          unmatched.push({
            itemId: r.id,
            confidence: r.match_confidence,
            subject,
            jobNumber: ex.jobNumber ? String(ex.jobNumber) : null,
          });
        }
      }
      console.log(
        `  ✓ ${rows.length} acknowledgment(s) detected — ${matched.length} matched, ${unmatched.length} unmatched, ${skippedAlreadyAcked} already-acknowledged (skipped)`,
      );
      summaries.push({ file: name, batchId, pageCount, status, matched, unmatched, skippedAlreadyAcked });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ ${name} failed:`, msg);
      summaries.push({ file: name, batchId: "", pageCount: 0, status: "error", matched: [], unmatched: [], skippedAlreadyAcked: 0, error: msg });
    }
    console.log("");
  }

  const totalMatched = summaries.reduce((n, s) => n + s.matched.length, 0);
  const totalUnmatched = summaries.reduce((n, s) => n + s.unmatched.length, 0);
  const totalSkipped = summaries.reduce((n, s) => n + s.skippedAlreadyAcked, 0);
  console.log("════ SUMMARY ════");
  console.log(
    `${summaries.length} batch(es) — ${totalMatched} matched to an existing complaint, ${totalUnmatched} unmatched (no existing complaint found), ${totalSkipped} already acknowledged (skipped).`,
  );
  console.log("Nothing has been attached or created — review at /complaints/acknowledgments, or re-run review via the batch IDs above.\n");
  if (report) console.log(JSON.stringify(summaries, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
