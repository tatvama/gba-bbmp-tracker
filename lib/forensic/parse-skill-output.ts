/**
 * PURE parsing of the forensic-skill export. No I/O — unit-testable.
 *
 * The export is BATCH-structured: a batch wrapper folder holds per-job source
 * folders AND a shared _AUDIT_OUTPUT (data/letters/work). A job's files are spread
 * across both, so we key everything off the JOB CODE found in each entry's path
 * (works for batches, the shared output, and the older flat layout alike).
 */
import { extractJobCode, isFullCode, mapPortalFileToDocType, isBlankTemplate } from "@/lib/ifms/downloader";
import type { RiskBand } from "@/lib/forensics/types";
import type { DetectedFile, ForensicDataset, ForensicFileRole, ForensicJobResult, ForensicRiskColour } from "./skill-output";

const MAX_TEXT = 40_000;

/** A ZIP entry; `text` is filled by the runner for textual files (json/txt/letter). */
export interface RawEntry {
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

/** Classify one entry by its FULL path (handles the shared _AUDIT_OUTPUT layout). */
export function classifyRelPath(relPath: string): ForensicFileRole {
  const lower = relPath.toLowerCase();
  const base = baseName(relPath);
  const lbase = base.toLowerCase();
  const ext = fileExt(base);

  // batch-level noise / placeholders → ignore
  if (lower.includes("ocrsafe_cache/")) return "other";
  if (/^_batch|^_work_split/.test(lbase)) return "other";
  if (lbase.endsWith("_index.json")) return "other";
  if (/-na\.(jpe?g|png|webp)$/i.test(lbase)) return "other"; // WO-*-NA.jpg placeholders

  const isLetterName = lower.includes("/letters/") || lbase.startsWith("job_") || lbase.includes("complaint");
  if (ext === "docx" && isLetterName) return "letter_docx";
  if (ext === "pdf" && isLetterName) return "letter_pdf";

  if (lbase.endsWith(".min.json")) return "min_json";
  if (ext === "json") return "rich_json"; // data/<code>.json (and any other curated json)
  if (lbase === "info.txt") return "info";
  if (ext === "txt") return "text";
  if (ext === "log") return "log";
  if (ext === "csv") return "evidence_csv";
  if (ext === "pdf") return "portal_pdf";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "portal_pdf"; // real site photos
  return "other";
}

/** Pull a risk colour out of the (often bilingual) overall_risk / ground.risk text. */
export function parseRiskColour(text: string | null | undefined): ForensicRiskColour | null {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/purple|ಅತಿ ?ಹೆಚ್ಚು/.test(t)) return "Purple";
  if (/\bred\b|ಹೆಚ್ಚು ಅಪಾಯ|ಕೆಂಪು/.test(t)) return "Red";
  if (/orange|ಕಿತ್ತಳೆ/.test(t)) return "Orange";
  if (/amber|ಹಳದಿ/.test(t)) return "Amber";
  if (/green|ಹಸಿರು|ಕಡಿಮೆ/.test(t)) return "Green";
  return null;
}

export function mapRiskColourToBand(colour: ForensicRiskColour | null | undefined): RiskBand {
  switch (colour) {
    case "Purple":
    case "Red":
      return "bill_stop";
    case "Orange":
      return "serious";
    case "Amber":
      return "procedural";
    default:
      return "low";
  }
}

const EXPECTED: { label: string; roles: ForensicFileRole[] }[] = [
  { label: "Forensic dataset (JSON)", roles: ["rich_json", "min_json"] },
  { label: "Drafted complaint letter", roles: ["letter_docx", "letter_pdf"] },
  { label: "Extracted text", roles: ["text"] },
  { label: "Source documents", roles: ["portal_pdf"] },
];

export function computeMissing(roles: Set<ForensicFileRole>): string[] {
  return EXPECTED.filter((e) => !e.roles.some((r) => roles.has(r))).map((e) => e.label);
}

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
    place: str(d.place),
    letter_date: str(d.letter_date),
    contractor:
      typeof d.contractor === "string" || (d.contractor && typeof d.contractor === "object")
        ? (d.contractor as ForensicDataset["contractor"])
        : undefined,
    identity_rows: arr(d.identity_rows),
    payment_rows: arr(d.payment_rows),
    quantity_rows: arr(d.quantity_rows),
    chronology: arr(d.chronology),
    grounds: arr(d.grounds),
    documents_demanded: arr(d.documents_demanded),
    treasury_loss_total: str(d.treasury_loss_total),
    overall_risk: str(d.overall_risk),
    loss_line: str(d.loss_line),
    misleading_summary:
      typeof d.misleading_summary === "string" || Array.isArray(d.misleading_summary)
        ? (d.misleading_summary as string | string[])
        : undefined,
    summary: str(d.summary),
    caveats: str(d.caveats),
    loss_components: arr(d.loss_components),
    document_presence: d.document_presence && typeof d.document_presence === "object" ? (d.document_presence as Record<string, unknown>) : undefined,
    bill_ids: str(d.bill_ids),
  };
  const hasContent =
    out.work ||
    out.summary ||
    (out.grounds && out.grounds.length) ||
    (out.payment_rows && out.payment_rows.length) ||
    out.overall_risk ||
    out.treasury_loss_total ||
    (out.loss_components && out.loss_components.length);
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

/** Group all ZIP entries by the job code found in each entry's path (no code → dropped). */
export function groupEntriesByJobCode(entries: RawEntry[]): Map<string, RawEntry[]> {
  const map = new Map<string, RawEntry[]>();
  for (const e of entries) {
    const code = extractJobCode(e.relPath);
    if (!code) continue; // batch-level noise (no job code in path)
    (map.get(code) ?? map.set(code, []).get(code)!).push(e);
  }
  return map;
}

/** Assemble one job's review result from all entries that carry its job code. */
export function parseJob(jobCode: string, entries: RawEntry[]): ForensicJobResult {
  const validCode = isFullCode(jobCode);
  const warnings: string[] = [];

  const detected: DetectedFile[] = entries.map((e) => {
    const fileName = baseName(e.relPath);
    const role = classifyRelPath(e.relPath);
    return {
      relPath: e.relPath,
      fileName,
      ext: fileExt(fileName),
      size: e.size,
      role,
      docType: role === "portal_pdf" ? mapPortalFileToDocType(fileName) : "",
      isBlankTemplate: isBlankTemplate(fileName),
    };
  });
  const roles = new Set<ForensicFileRole>(detected.map((d) => d.role));
  const byRole = (r: ForensicFileRole) => entries.find((e) => classifyRelPath(e.relPath) === r);

  // Dataset: prefer the rich data/<code>.json, fall back to the skeleton min.json.
  const richFile = byRole("rich_json");
  const minFile = byRole("min_json");
  const dataset = parseJsonText(richFile?.text) ?? parseJsonText(minFile?.text);

  const letterDocx = detected.find((d) => d.role === "letter_docx") ?? null;
  const letterPdf = detected.find((d) => d.role === "letter_pdf") ?? null;
  const letterText = cap(byRole("letter_docx")?.text ?? byRole("letter_pdf")?.text);
  const extractedText = cap(byRole("text")?.text);

  if (!validCode) warnings.push(`"${jobCode}" is not a valid job code (ddd-yy-nnnnnn).`);

  const source = dataset ? "json" : letterText || extractedText ? "ai-from-letter" : "none";

  return {
    jobCode,
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
    riskColour: dataset ? parseRiskColour(dataset.overall_risk) : null,
    skip: !validCode,
  };
}

/** Assemble every job in the ZIP, keyed by job code (batch-agnostic). */
export function assembleForensicJobs(entries: RawEntry[]): ForensicJobResult[] {
  const grouped = groupEntriesByJobCode(entries);
  return [...grouped.entries()]
    .map(([code, es]) => parseJob(code, es))
    .sort((a, b) => a.jobCode.localeCompare(b.jobCode));
}

/**
 * The R2 sub-path for one entry, preserving the forensic-audit-skill's own
 * layout (no invented Bills/Photos/Documents taxonomy):
 *  - _AUDIT_OUTPUT-rooted files (shared across all jobs) → everything AFTER
 *    "_AUDIT_OUTPUT/" (e.g. "data/<code>.json", "letters/Job_<code>_....docx",
 *    "work/<code>.txt") — exactly the data/letters/work grouping the skill
 *    already uses.
 *  - the job's OWN source folder (<batch>/<job-code>/*, flat today) →
 *    everything after the <job-code> path segment (falls back to the
 *    basename if the code segment isn't found, or if a future export nests
 *    subfolders under it — still correct either way).
 */
export function forensicR2SubPath(relPath: string, jobCode: string): string {
  const norm = relPath.replace(/\\/g, "/");
  const marker = "_AUDIT_OUTPUT/";
  const idx = norm.indexOf(marker);
  if (idx !== -1) {
    const sub = norm.slice(idx + marker.length);
    if (sub) return sub;
  }
  const segs = norm.split("/");
  const codeIdx = segs.indexOf(jobCode);
  if (codeIdx !== -1 && codeIdx < segs.length - 1) {
    return segs.slice(codeIdx + 1).join("/");
  }
  return segs.pop() || norm; // fallback: basename
}
