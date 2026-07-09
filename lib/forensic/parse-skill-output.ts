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

/**
 * Group all ZIP entries by the job code found in each entry's path (no code →
 * dropped). When NOTHING inside the ZIP carries a job code (a flat single-job
 * export with generic file names), fall back to the job code embedded in the
 * ZIP's own uploaded filename (e.g. "047-25-000003.zip") and treat every entry
 * as belonging to that one job — otherwise the whole batch would be silently
 * dropped ("No job-code folders found").
 *
 * Trust hierarchy — folder names and the ZIP's own filename are machine-made
 * and reliable; LEAF filenames are hand-typed by humans when scanning and get
 * job codes mistyped (a real ZIP contained "WB-MB-184-83-000003 MB Book.pdf"
 * inside job 184-23-000003 — one wrong digit). A code that appears ONLY in
 * leaf filenames must not spawn its own job when the ZIP has exactly one
 * trusted code: it would create a phantom job case + complaint out of a typo.
 * So when there is a single "anchor" code (one job-code folder, or none and
 * the ZIP filename carries a code), every other leaf-derived group is folded
 * into the anchor job instead, and `notes` (if given) records what moved.
 * Multi-job ZIPs (several job-code folders) are left exactly as before —
 * there is no unambiguous place to fold a stray code into.
 */
export function groupEntriesByJobCode(
  entries: RawEntry[],
  fallbackName?: string | null,
  notes?: string[],
): Map<string, RawEntry[]> {
  const map = new Map<string, RawEntry[]>();
  const dirAnchored = new Set<string>(); // codes that appear in a DIRECTORY segment
  const noise: RawEntry[] = []; // entries with no job code anywhere in the path
  for (const e of entries) {
    const code = extractJobCode(e.relPath);
    if (!code) {
      noise.push(e);
      continue; // batch-level noise (no job code in path)
    }
    (map.get(code) ?? map.set(code, []).get(code)!).push(e);
    const dirPart = e.relPath.split("/").slice(0, -1).join("/");
    if (extractJobCode(dirPart) === code) dirAnchored.add(code);
  }

  const zipCode = extractJobCode(fallbackName ?? null);
  // The single trusted code, when one exists: a lone job-code folder wins;
  // with no folders at all (flat ZIP), the ZIP's own filename wins.
  const anchor =
    dirAnchored.size === 1 ? [...dirAnchored][0]! : dirAnchored.size === 0 ? zipCode : null;

  if (anchor) {
    if (!map.has(anchor)) map.set(anchor, []);
    const anchorEntries = map.get(anchor)!;
    for (const [code, es] of map) {
      if (code === anchor) continue;
      anchorEntries.push(...es);
      map.delete(code);
      notes?.push(
        `"${code}" appears only in ${es.length} hand-typed file name(s) (${es
          .map((e) => e.relPath)
          .slice(0, 3)
          .join(", ")}${es.length > 3 ? ", …" : ""}) — treated as a typo of ${anchor}, not a separate job.`,
      );
    }
    // A flat single-job ZIP named by its code: EVERY file in it belongs to
    // that job, including ones with no code in the name (info.txt, blanks…).
    // Folder-anchored batches keep dropping outside-the-folder noise as before.
    if (dirAnchored.size === 0 && noise.length) anchorEntries.push(...noise);
    if (anchorEntries.length === 0) map.delete(anchor);
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
  const allOfRole = (r: ForensicFileRole) => entries.filter((e) => classifyRelPath(e.relPath) === r);

  // Dataset: several JSONs can share the rich_json role (the newer _AUDIT_REPORT
  // layout ships <code>_FORENSIC_REPORT.json AND <code>_DOC_COMPLETENESS.json,
  // and the completeness file sorts FIRST alphabetically) — so rank candidates
  // by name and take the first that actually parses into forensic content,
  // instead of blindly reading whichever entry came first.
  const richRank = (p: string) => {
    const l = p.toLowerCase();
    if (l.includes("forensic_report")) return 0;
    if (/(^|\/)data\//.test(l)) return 1;
    if (l.includes("doc_completeness")) return 3;
    return 2;
  };
  const richCandidates = [...allOfRole("rich_json")].sort((a, b) => richRank(a.relPath) - richRank(b.relPath));
  let dataset: ForensicDataset | null = null;
  for (const c of richCandidates) {
    dataset = parseJsonText(c.text);
    if (dataset) break;
  }
  const minFile = byRole("min_json");
  dataset = dataset ?? parseJsonText(minFile?.text);
  // Fold the skill's document-completeness JSON into the dataset (which docs
  // are present/missing) when the dataset itself doesn't carry it.
  const completeness = richCandidates.find((c) => c.relPath.toLowerCase().includes("doc_completeness"));
  if (dataset && !dataset.document_presence && completeness?.text) {
    try {
      const cj = JSON.parse(completeness.text) as unknown;
      if (cj && typeof cj === "object" && !Array.isArray(cj)) dataset.document_presence = cj as Record<string, unknown>;
    } catch {
      /* completeness JSON is optional */
    }
  }

  const letterDocx = detected.find((d) => d.role === "letter_docx") ?? null;
  const letterPdf = detected.find((d) => d.role === "letter_pdf") ?? null;
  // Several .txt files can share the text role (the OCR dump AND a plain-text
  // copy of the drafted letter) — the OCR/work text is the extractedText; a
  // complaint-named .txt is a letter-text fallback when DOCX extraction fails.
  const textRank = (p: string) => {
    const l = p.toLowerCase();
    if (l.includes("ocr_text")) return 0;
    if (/(^|\/)work\//.test(l)) return 1;
    if (l.includes("complaint")) return 3;
    return 2;
  };
  const textEntries = [...allOfRole("text")].sort((a, b) => textRank(a.relPath) - textRank(b.relPath));
  const letterTxt = textEntries.find((e) => baseName(e.relPath).toLowerCase().includes("complaint"));
  // `||` not `??` — a letter DOCX whose text extraction produced "" must fall
  // through to the PDF text, then to the plain-text letter copy.
  const letterText = cap(byRole("letter_docx")?.text || byRole("letter_pdf")?.text || letterTxt?.text);
  const extractedText = cap(textEntries.find((e) => e !== letterTxt)?.text);

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
