import "server-only";
import { readFile } from "node:fs/promises";
import { createAdminClient } from "@/lib/supabase/admin";
import { walkTempDir } from "@/lib/forensic/zip";
import { groupEntriesByJobCode, classifyRelPath, parseJob, fileExt, type RawEntry } from "@/lib/forensic/parse-skill-output";
import { extractDocxText } from "@/lib/forensic/docx-text";
import { deriveDatasetFromLetter } from "@/lib/ai/forensic-letter-extract";
import { classifyComplaintType } from "@/lib/ai/classify-complaint-type";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import { isFullCode } from "@/lib/ifms/downloader";
import type { ForensicFileRole, ForensicJobResult } from "@/lib/forensic/skill-output";

const TEXTUAL: Set<ForensicFileRole> = new Set(["rich_json", "min_json", "text", "info"]);
const LETTER_PDF_OCR_PAGE_CAP = 8;

function decode(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

export interface AnalyzeProgress {
  /** 0..1 across all job folders in the batch */
  fraction: number;
  message: string;
}

/**
 * Background inventory + parse of an extracted forensic ZIP (runs in Next
 * `after()` for direct uploads, or from the import-queue worker for chunked
 * uploads). Reads from the local temp dir already extracted into — no
 * re-download, no re-unzip (the raw ZIP is never uploaded anywhere). Does NOT
 * delete tempDirPath: the commit step still needs it.
 */
export async function processForensicBatch(
  batchId: string,
  tempDirPath: string,
  onProgress?: (p: AnalyzeProgress) => void,
  originalFileName?: string | null,
): Promise<void> {
  const admin = createAdminClient();
  try {
    console.log(`[processForensicBatch] started batch=${batchId} tempDir=${tempDirPath} ts=${new Date().toISOString()}`);
    const files = await walkTempDir(tempDirPath);
    if (files.length === 0) {
      throw new Error("Extracted files are no longer available (the server may have restarted) — please re-upload the ZIP.");
    }
    const absByRel = new Map(files.map((f) => [f.relPath, f.absPath] as const));
    const raw: RawEntry[] = files.map((f) => ({ relPath: f.relPath, size: f.size }));
    // Codes seen only in hand-typed leaf filenames that got folded into the
    // ZIP's single real job (typo protection) — surfaced as job warnings so
    // the review screen shows exactly which files were reassigned and why.
    const groupingNotes: string[] = [];
    const grouped = groupEntriesByJobCode(raw, originalFileName, groupingNotes);

    // Which job codes are already imported? A job case whose linked complaint
    // was soft-deleted doesn't count — the user explicitly discarded that
    // import, so re-uploading it must work (commit upserts job_cases on
    // job_number, refreshing the existing row rather than duplicating it).
    const codes = [...grouped.keys()];
    const existing = new Set<string>();
    if (codes.length) {
      const { data } = await admin
        .from("job_cases")
        .select("job_number, complaint_id, complaints(deleted_at)")
        .in("job_number", codes);
      type JoinRow = { job_number: string; complaint_id: string | null; complaints: { deleted_at: string | null } | { deleted_at: string | null }[] | null };
      for (const r of (data ?? []) as unknown as JoinRow[]) {
        // The complaint_id FK is many-to-one, so `complaints` is a single row
        // at runtime — but supabase-js types it as an array without generated
        // relationship metadata, so accept both shapes.
        const complaint = Array.isArray(r.complaints) ? r.complaints[0] : r.complaints;
        if (r.complaint_id && complaint?.deleted_at) continue;
        existing.add(r.job_number);
      }
    }

    const jobs: ForensicJobResult[] = [];
    let jobIdx = 0;
    for (const [code, es] of grouped) {
      onProgress?.({ fraction: jobIdx / Math.max(1, grouped.size), message: `Reading job folder ${code} (${jobIdx + 1}/${grouped.size})…` });
      jobIdx += 1;
      // One malformed job (unreadable file, corrupt DOCX, a letter-PDF render/OCR
      // or AI-derivation hiccup that throws instead of degrading gracefully) must
      // not sink the whole batch — a real export can have hundreds of unrelated
      // job folders, and the other ~99% shouldn't be lost because of one.
      try {
        let letterDocxRel: string | null = null;
        let letterPdfRel: string | null = null;
        for (const e of es) {
          const role = classifyRelPath(e.relPath);
          if (TEXTUAL.has(role)) e.text = decode(await readFile(absByRel.get(e.relPath)!));
          else if (role === "letter_docx" && !letterDocxRel) letterDocxRel = e.relPath;
          else if (role === "letter_pdf" && !letterPdfRel) letterPdfRel = e.relPath;
        }

        // Letter text: DOCX (lossless) preferred, else OCR the letter PDF.
        let letterText = "";
        if (letterDocxRel) letterText = await extractDocxText(await readFile(absByRel.get(letterDocxRel)!));
        if (!letterText && letterPdfRel) {
          try {
            const pages = await pdfRenderer.renderPages(await readFile(absByRel.get(letterPdfRel)!));
            const parts: string[] = [];
            for (const p of pages.slice(0, LETTER_PDF_OCR_PAGE_CAP)) {
              const r = await runOcr({ buffer: p.buffer, mimeType: p.mimeType, language: "eng+kan" });
              parts.push(r.cleanText || r.rawText || "");
            }
            letterText = parts.join("\n").trim();
          } catch (e) {
            console.warn("[forensic] letter PDF OCR failed", code, e);
          }
        }
        const letterRel = letterDocxRel ?? letterPdfRel;
        if (letterRel) {
          const f = es.find((x) => x.relPath === letterRel);
          if (f) f.text = letterText;
        }

        const result = parseJob(code, es);
        // Typo-folding only happens when the batch resolves to a single job,
        // so these notes always belong to the one job being parsed here.
        if (groupingNotes.length) result.warnings.push(...groupingNotes);
        result.alreadyImported = existing.has(result.jobCode);
        if (result.alreadyImported) {
          // A job case with this code is already in the system — do not
          // re-upload/merge it silently. Defaults to excluded from commit;
          // the review screen also disables re-including it.
          result.skip = true;
          result.warnings.push(
            `Duplicate job number — a job case for ${result.jobCode} already exists. This folder will not be uploaded.`,
          );
        }
        if (result.source === "ai-from-letter" && !result.dataset) {
          const ds = await deriveDatasetFromLetter(result.jobCode, result.letterText, result.extractedText);
          if (ds) {
            result.dataset = ds;
          } else {
            result.warnings.push(
              "No forensic JSON, and AI could not read the letter (or AI is not configured) — create the case and add details manually.",
            );
          }
        }

        // Detect the responsible BBMP department (the complaint type). Work +
        // summary lead the signal; letter/OCR text backs it up. Best-effort:
        // classifyComplaintType returns "Other" on any failure and never throws.
        if (!result.skip) {
          const clsText = [
            result.dataset?.work,
            result.dataset?.summary,
            result.letterText,
            result.extractedText,
          ].filter(Boolean).join("\n\n");
          result.complaintType = clsText.trim() ? await classifyComplaintType(clsText) : "Other";
        }

        jobs.push(result);
      } catch (e) {
        console.error(`[processForensicBatch] job FAILED code=${code}`, e);
        jobs.push({
          jobCode: code,
          validCode: isFullCode(code),
          files: es.map((entry) => ({
            relPath: entry.relPath,
            fileName: entry.relPath.split("/").pop() || entry.relPath,
            ext: fileExt(entry.relPath),
            size: entry.size,
            role: classifyRelPath(entry.relPath),
            docType: "",
            isBlankTemplate: false,
          })),
          missing: [],
          warnings: [`Could not read this job folder: ${e instanceof Error ? e.message : "unknown error"}`],
          source: "none",
          dataset: null,
          letterText: "",
          extractedText: "",
          letterFileRel: null,
          letterPdfRel: null,
          riskColour: null,
          skip: true,
        });
      } finally {
        // parseJob() (or the failure placeholder above) has already copied
        // everything it needs out of `es` — the decoded JSON/OCR text has no
        // further use. `grouped` holds every job in the batch for the whole
        // analyze pass, so freeing per-job as we go (instead of only when the
        // whole function returns) bounds peak memory on a ZIP with many jobs
        // instead of accumulating every job's full text simultaneously.
        for (const e of es) e.text = undefined;
      }
    }
    jobs.sort((a, b) => a.jobCode.localeCompare(b.jobCode));

    await admin
      .from("forensic_import_batches")
      .update({ status: "Ready", jobs, folder_count: jobs.length, error: jobs.length ? null : "No job-code folders found in the ZIP." })
      .eq("id", batchId);
    console.log(`[processForensicBatch] ready batch=${batchId} jobs=${jobs.length} ts=${new Date().toISOString()}`);
  } catch (e) {
    console.error("[processForensicBatch]", e);
    await admin
      .from("forensic_import_batches")
      .update({ status: "Failed", error: e instanceof Error ? e.message : "Import failed" })
      .eq("id", batchId);
  }
}
