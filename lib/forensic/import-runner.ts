import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFromR2 } from "@/lib/storage/r2-upload";
import { readZipEntries } from "@/lib/forensic/zip";
import { groupEntriesByJobCode, classifyRelPath, parseJob, type RawEntry } from "@/lib/forensic/parse-skill-output";
import { extractDocxText } from "@/lib/forensic/docx-text";
import { deriveDatasetFromLetter } from "@/lib/ai/forensic-letter-extract";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import type { ForensicFileRole, ForensicJobResult } from "@/lib/forensic/skill-output";

const TEXTUAL: Set<ForensicFileRole> = new Set(["rich_json", "min_json", "text", "info"]);
const LETTER_PDF_OCR_PAGE_CAP = 8;

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

/**
 * Background inventory + parse of an uploaded forensic ZIP (runs in Next `after()`).
 * The export is batch-structured (job folders + a shared _AUDIT_OUTPUT), so we key
 * every entry off its job code, read the textual files (JSON/OCR) + the drafted
 * letter text, parse each job, and AI-derive a dataset when no JSON is present.
 */
export async function processForensicBatch(batchId: string, storagePath: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const zip = await downloadFromR2(storagePath);
    if (!zip) throw new Error("Could not download the staged ZIP.");

    const zipEntries = readZipEntries(zip); // [{ path (full), bytes }]
    const bytesByPath = new Map(zipEntries.map((e) => [e.path, e.bytes] as const));
    const raw: RawEntry[] = zipEntries.map((e) => ({ relPath: e.path, size: e.bytes.byteLength }));
    const grouped = groupEntriesByJobCode(raw);

    // Which job codes are already imported?
    const codes = [...grouped.keys()];
    const existing = new Set<string>();
    if (codes.length) {
      const { data } = await admin.from("job_cases").select("job_number").in("job_number", codes);
      for (const r of data ?? []) existing.add(r.job_number as string);
    }

    const jobs: ForensicJobResult[] = [];
    for (const [code, es] of grouped) {
      let letterDocxRel: string | null = null;
      let letterPdfRel: string | null = null;
      for (const e of es) {
        const role = classifyRelPath(e.relPath);
        if (TEXTUAL.has(role)) e.text = decode(bytesByPath.get(e.relPath)!);
        else if (role === "letter_docx" && !letterDocxRel) letterDocxRel = e.relPath;
        else if (role === "letter_pdf" && !letterPdfRel) letterPdfRel = e.relPath;
      }

      // Letter text: DOCX (lossless) preferred, else OCR the letter PDF.
      let letterText = "";
      if (letterDocxRel) letterText = await extractDocxText(Buffer.from(bytesByPath.get(letterDocxRel)!));
      if (!letterText && letterPdfRel) {
        try {
          const pages = await pdfRenderer.renderPages(Buffer.from(bytesByPath.get(letterPdfRel)!));
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
      result.alreadyImported = existing.has(result.jobCode);
      if (result.alreadyImported) {
        result.warnings.push("A job case with this code already exists — committing will merge/refresh it.");
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
      jobs.push(result);
    }
    jobs.sort((a, b) => a.jobCode.localeCompare(b.jobCode));

    await admin
      .from("forensic_import_batches")
      .update({ status: "Ready", jobs, folder_count: jobs.length, error: jobs.length ? null : "No job-code folders found in the ZIP." })
      .eq("id", batchId);
  } catch (e) {
    console.error("[processForensicBatch]", e);
    await admin
      .from("forensic_import_batches")
      .update({ status: "Failed", error: e instanceof Error ? e.message : "Import failed" })
      .eq("id", batchId);
  }
}
