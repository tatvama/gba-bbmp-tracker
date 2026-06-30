/**
 * PURE parsing of a forensic-skill job-code folder. No I/O — unit-testable, like
 * lib/ifms/downloader.ts. The runner does the file reads / DOCX-text extraction
 * and passes the textual contents in; this module classifies the files, picks the
 * dataset, and assembles the per-job review result.
 */
import {
  extractJobCode,
  isFullCode,
  mapPortalFileToDocType,
  isBlankTemplate,
} from "@/lib/ifms/downloader";
import type { RiskBand } from "@/lib/forensics/types";
import type {
  DetectedFile,
  ForensicDataset,
  ForensicFileRole,
  ForensicJobResult,
  ForensicRiskColour,
} from "./skill-output";

const MAX_TEXT = 40_000; // cap stored text fields (full bytes live in storage)

/** A file handed to the parser; `text` is filled for textual files (json/txt/letter). */
export interface RawFile {
  relPath: string;
  size: number;
  text?: string | null;
}

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1]!.toLowerCase() : "";
}

function baseName(relPath: string): string {
  return (relPath || "").split("/").pop() || relPath || "";
}

/** Classify one file within a job-code folder. Order matters (specific first). */
export function classifyFile(fileName: string): ForensicFileRole {
  const f = (fileName || "").toLowerCase();
  const ext = fileExt(f);
  if (f.endsWith(".min.json")) return "min_json";
  if (ext === "json") return "rich_json";
  if (f === "info.txt") return "info";
  if (ext === "txt") return "text";
  if (ext === "log") return "log";
  if (ext === "csv") return "evidence_csv";
  if (ext === "docx" || ext === "pdf") {
    const isLetter = f.includes("complaint") || f.startsWith("job_") || f.includes("letter");
    if (isLetter) return ext === "docx" ? "letter_docx" : "letter_pdf";
    if (ext === "pdf" && /^(wo|wb|ba|pmc)[-_]/i.test(baseName(f))) return "portal_pdf";
    return ext === "pdf" ? "portal_pdf" : "other";
  }
  return "other";
}

/** Map the skill's risk colour to the app's RiskBand. */
export function mapRiskColourToBand(colour: ForensicRiskColour | string | null | undefined): RiskBand {
  switch ((colour || "").toString().trim().toLowerCase()) {
    case "purple":
    case "red":
      return "bill_stop";
    case "orange":
      return "serious";
    case "amber":
      return "procedural";
    case "green":
    default:
      return "low";
  }
}

const EXPECTED: { label: string; roles: ForensicFileRole[] }[] = [
  { label: "Extracted text", roles: ["text"] },
  { label: "Forensic dataset (JSON)", roles: ["min_json", "rich_json"] },
  { label: "Kannada complaint letter", roles: ["letter_docx", "letter_pdf"] },
  { label: "Evidence index", roles: ["evidence_csv"] },
];

/** Human labels for expected-but-absent pieces (logs / portal PDFs are optional). */
export function computeMissing(roles: Set<ForensicFileRole>): string[] {
  return EXPECTED.filter((e) => !e.roles.some((r) => roles.has(r))).map((e) => e.label);
}

/** Tolerant validation/normalisation of a parsed minimum-dataset object. */
export function normalizeDataset(raw: unknown): ForensicDataset | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : v == null ? undefined : String(v));
  const arr = <T>(v: unknown): T[] | undefined => (Array.isArray(v) ? (v as T[]) : undefined);
  const out: ForensicDataset = {
    code: str(d.code),
    org: str(d.org),
    work: str(d.work),
    wards: str(d.wards),
    zone: str(d.zone),
    division: str(d.division),
    sub_division: str(d.sub_division),
    sr_year: str(d.sr_year),
    contractor: (d.contractor && typeof d.contractor === "object" ? d.contractor : undefined) as
      | ForensicDataset["contractor"]
      | undefined,
    estimate_cost: str(d.estimate_cost),
    administrative_sanction: (d.administrative_sanction ?? undefined) as ForensicDataset["administrative_sanction"],
    technical_sanction: (d.technical_sanction ?? undefined) as ForensicDataset["technical_sanction"],
    agreement: (d.agreement ?? undefined) as ForensicDataset["agreement"],
    work_order: (d.work_order ?? undefined) as ForensicDataset["work_order"],
    cbr: str(d.cbr),
    rtgs: str(d.rtgs),
    bill_ids: str(d.bill_ids),
    payment_rows: arr(d.payment_rows),
    quantity_rows: arr(d.quantity_rows),
    chronology: arr(d.chronology),
    document_presence: (d.document_presence && typeof d.document_presence === "object"
      ? (d.document_presence as Record<string, string>)
      : undefined),
    blank_form_files: arr<string>(d.blank_form_files),
    loss_components: arr(d.loss_components),
    loss_line: str(d.loss_line),
    treasury_loss_total: str(d.treasury_loss_total),
    misleading_summary: (typeof d.misleading_summary === "string" || Array.isArray(d.misleading_summary)
      ? (d.misleading_summary as string | string[])
      : undefined),
    overall_risk: (["Green", "Amber", "Orange", "Red", "Purple"].includes(String(d.overall_risk))
      ? (d.overall_risk as ForensicRiskColour)
      : undefined),
    summary: str(d.summary),
    caveats: str(d.caveats),
  };
  // Reject an object with no recognisable forensic content.
  const hasContent =
    out.work ||
    out.summary ||
    out.treasury_loss_total ||
    (out.loss_components && out.loss_components.length) ||
    (out.payment_rows && out.payment_rows.length) ||
    out.overall_risk;
  return hasContent ? out : null;
}

function parseJsonText(text: string | null | undefined): ForensicDataset | null {
  if (!text) return null;
  try {
    return normalizeDataset(JSON.parse(text));
  } catch {
    return null;
  }
}

function cap(text: string | null | undefined): string {
  if (!text) return "";
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

/**
 * Assemble a per-job review result from a job-code folder's files.
 * The folder name should BE the job code; we extract tolerantly and flag invalid.
 */
export function parseJobFolder(folderName: string, files: RawFile[]): ForensicJobResult {
  const extracted = extractJobCode(folderName) ?? folderName.trim();
  const validCode = isFullCode(extracted);
  const warnings: string[] = [];

  const detected: DetectedFile[] = files.map((f) => {
    const fileName = baseName(f.relPath);
    const role = classifyFile(fileName);
    return {
      relPath: f.relPath,
      fileName,
      ext: fileExt(fileName),
      size: f.size,
      role,
      docType: role === "portal_pdf" ? mapPortalFileToDocType(fileName) : "",
      isBlankTemplate: isBlankTemplate(fileName),
    };
  });

  const roles = new Set<ForensicFileRole>(detected.map((d) => d.role));
  const byRole = (r: ForensicFileRole) => files.find((f) => classifyFile(baseName(f.relPath)) === r);

  // Dataset: prefer .min.json, then a rich .json.
  const minFile = byRole("min_json");
  const richFile = byRole("rich_json");
  if (minFile && richFile) warnings.push("Both .min.json and .json present — used .min.json.");
  const dataset = parseJsonText(minFile?.text) ?? parseJsonText(richFile?.text);

  // Letter (DOCX is canonical; the runner extracts its text).
  const letterDocx = detected.find((d) => d.role === "letter_docx") ?? null;
  const letterPdf = detected.find((d) => d.role === "letter_pdf") ?? null;
  const letterText = cap(byRole("letter_docx")?.text ?? byRole("letter_pdf")?.text);
  const extractedText = cap(byRole("text")?.text);

  if (!validCode) warnings.push(`Folder "${folderName}" is not a valid job code (ddd-yy-nnnnnn).`);

  const hasLetterOrText = Boolean(letterText || extractedText);
  const source = dataset ? "json" : hasLetterOrText ? "ai-from-letter" : "none";

  return {
    jobCode: extracted,
    validCode,
    files: detected,
    missing: computeMissing(roles),
    warnings,
    source,
    dataset,
    letterText,
    extractedText,
    letterFileRel: letterDocx?.relPath ?? null,
    letterPdfRel: letterPdf?.relPath ?? null,
    riskColour: dataset?.overall_risk ?? null,
    skip: !validCode,
  };
}
