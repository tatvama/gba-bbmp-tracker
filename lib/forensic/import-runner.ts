import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFromR2 } from "@/lib/storage/r2-upload";
import { readZipEntries, groupByTopFolder } from "@/lib/forensic/zip";
import { parseJobFolder, classifyFile, type RawFile } from "@/lib/forensic/parse-skill-output";
import { extractDocxText } from "@/lib/forensic/docx-text";
import { deriveDatasetFromLetter } from "@/lib/ai/forensic-letter-extract";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import type { ForensicFileRole, ForensicJobResult } from "@/lib/forensic/skill-output";

const TEXTUAL: Set<ForensicFileRole> = new Set(["min_json", "rich_json", "text", "info", "evidence_csv", "log"]);
const LETTER_PDF_OCR_PAGE_CAP = 8;

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function baseName(p: string): string {
  return p.split("/").pop() || p;
}

/**
 * Background inventory + parse of an uploaded forensic ZIP (runs in Next `after()`).
 * Downloads the staged ZIP, groups by top-level folder (= job code), reads the
 * textual files, extracts the letter text (DOCX via mammoth, else OCR the letter
 * PDF), parses each folder, and AI-derives a dataset when no JSON is present.
 * Writes the per-job results to forensic_import_batches for the review screen.
 */
export async function processForensicBatch(batchId: string, storagePath: string): Promise<void> {
  const admin = createAdminClient();
  try {
    const zip = await downloadFromR2(storagePath);
    if (!zip) throw new Error("Could not download the staged ZIP.");

    const { groups, rootFiles } = groupByTopFolder(readZipEntries(zip));

    // Which job codes are already imported (for the "already imported" chip)?
    const folderNames = groups.map((g) => g.folder);
    const existing = new Set<string>();
    if (folderNames.length) {
      const { data } = await admin.from("job_cases").select("job_number").in("job_number", folderNames);
      for (const r of data ?? []) existing.add(r.job_number as string);
    }

    const jobs: ForensicJobResult[] = [];
    for (const g of groups) {
      const raw: RawFile[] = [];
      let letterDocx: { rel: string; bytes: Uint8Array } | null = null;
      let letterPdf: { rel: string; bytes: Uint8Array } | null = null;

      for (const e of g.entries) {
        const role = classifyFile(baseName(e.path));
        let text: string | undefined;
        if (TEXTUAL.has(role)) text = decode(e.bytes);
        else if (role === "letter_docx" && !letterDocx) letterDocx = { rel: e.path, bytes: e.bytes };
        else if (role === "letter_pdf" && !letterPdf) letterPdf = { rel: e.path, bytes: e.bytes };
        raw.push({ relPath: e.path, size: e.bytes.byteLength, text });
      }

      // Letter text: prefer DOCX (lossless), else OCR the letter PDF.
      let letterText = "";
      if (letterDocx) letterText = await extractDocxText(Buffer.from(letterDocx.bytes));
      if (!letterText && letterPdf) {
        try {
          const pages = await pdfRenderer.renderPages(Buffer.from(letterPdf.bytes));
          const parts: string[] = [];
          for (const p of pages.slice(0, LETTER_PDF_OCR_PAGE_CAP)) {
            const r = await runOcr({ buffer: p.buffer, mimeType: p.mimeType, language: "eng+kan" });
            parts.push(r.cleanText || r.rawText || "");
          }
          letterText = parts.join("\n").trim();
        } catch (e) {
          console.warn("[forensic] letter PDF OCR failed", g.folder, e);
        }
      }
      // Feed the letter text back into the RawFile the parser will read it from.
      const letterRel = letterDocx?.rel ?? letterPdf?.rel;
      if (letterRel) {
        const f = raw.find((x) => x.relPath === letterRel);
        if (f) f.text = letterText;
      }

      const result = parseJobFolder(g.folder, raw);
      result.alreadyImported = existing.has(result.jobCode);
      if (result.alreadyImported) {
        result.warnings.push("A job case with this code already exists — committing will merge/refresh it.");
      }

      // AI fallback when there is no JSON but we have letter / extracted text.
      if (result.source === "ai-from-letter" && !result.dataset) {
        const ds = await deriveDatasetFromLetter(result.jobCode, result.letterText, result.extractedText);
        if (ds) {
          result.dataset = ds;
          result.riskColour = ds.overall_risk ?? null;
        } else {
          result.warnings.push(
            "No forensic JSON, and AI could not read the letter (or AI is not configured) — create the case and add details manually.",
          );
        }
      }

      jobs.push(result);
    }

    await admin
      .from("forensic_import_batches")
      .update({
        status: "Ready",
        jobs,
        folder_count: groups.length,
        error: rootFiles.length
          ? `${rootFiles.length} file(s) at the ZIP root were ignored — expected one folder per job code.`
          : null,
      })
      .eq("id", batchId);
  } catch (e) {
    console.error("[processForensicBatch]", e);
    await admin
      .from("forensic_import_batches")
      .update({ status: "Failed", error: e instanceof Error ? e.message : "Import failed" })
      .eq("id", batchId);
  }
}
