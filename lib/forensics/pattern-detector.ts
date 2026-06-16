/**
 * Repeat-pattern detection across multiple jobs + cross-document field mismatch
 * (PURE). Patterns spanning ≥2 job codes are stronger than isolated issues.
 */
import type { BillFinding } from "./types";

export interface JobPatternRow {
  jobNumber: string;
  contractor?: string | null;
  officer?: string | null;
  itemCodes?: string[];
  findingTypes?: string[];
  missingRecords?: string[];
  photoHashes?: string[];
}

const KEYS: (keyof JobPatternRow)[] = ["contractor", "officer"];
const LIST_KEYS: (keyof JobPatternRow)[] = ["itemCodes", "findingTypes", "missingRecords", "photoHashes"];

/** Values (contractor / officer / item / finding-type / photo-hash) recurring across ≥2 jobs. */
export function detectRepeatPatterns(jobs: JobPatternRow[]): BillFinding[] {
  const out: BillFinding[] = [];
  // field -> value -> set of job numbers
  const groups = new Map<string, Map<string, Set<string>>>();
  const add = (field: string, value: string, job: string) => {
    if (!value) return;
    const v = value.trim().toLowerCase();
    if (!v) return;
    const fm = groups.get(field) ?? groups.set(field, new Map()).get(field)!;
    (fm.get(v) ?? fm.set(v, new Set()).get(v)!).add(job);
  };
  for (const j of jobs) {
    for (const k of KEYS) { const val = j[k]; if (typeof val === "string") add(k, val, j.jobNumber); }
    for (const k of LIST_KEYS) { const arr = j[k]; if (Array.isArray(arr)) for (const v of arr) add(k, v, j.jobNumber); }
  }
  let i = 0;
  for (const [field, fm] of groups) {
    for (const [value, jobsSet] of fm) {
      if (jobsSet.size >= 2) {
        out.push({
          code: `PT-${String(++i).padStart(2, "0")}`,
          title: `Repeat pattern: ${field} "${value}" across ${jobsSet.size} jobs`,
          severity: jobsSet.size >= 3 ? "High" : "Medium",
          category: "PATTERN",
          findingClass: "confirmed_mismatch",
          evidenceGrade: "B",
          detail: `${field} "${value}" recurs across job codes: ${[...jobsSet].join(", ")}. A consolidated review is warranted.`,
          recordToDemand: "Consolidated records for the listed job codes",
        });
      }
    }
  }
  return out;
}

const norm = (v: unknown) =>
  v == null ? "" : String(v).trim().toLowerCase().replace(/\s+/g, " ").replace(/private limited/g, "pvt ltd").replace(/limited/g, "ltd").replace(/[.,]/g, "");

/** Fields whose value differs across supplied documents (identity/amount mismatch). */
export function crossDocFieldMismatch(
  documents: Record<string, string | number | null>[],
  fields: string[] = ["job_code", "contractor", "gst", "pan", "work_name", "ward", "agreement_amount", "ts_amount", "work_order_amount"],
): BillFinding[] {
  const out: BillFinding[] = [];
  fields.forEach((f, idx) => {
    const vals = documents.map((d) => d[f]).filter((v) => v != null && v !== "");
    if (vals.length < 2) return;
    const distinct = new Set(vals.map(norm));
    if (distinct.size > 1) {
      out.push({
        code: `PT-X${String(idx + 1).padStart(2, "0")}`,
        title: `Field "${f}" differs across documents`,
        severity: ["job_code", "contractor", "agreement_amount"].includes(f) ? "High" : "Medium",
        category: "PATTERN",
        findingClass: "confirmed_mismatch",
        evidenceGrade: "A",
        detail: `"${f}" has differing values across the supplied documents: ${[...new Set(vals.map(String))].join(" | ")}.`,
        recordToDemand: `Certified record reconciling "${f}" across documents`,
      });
    }
  });
  return out;
}
