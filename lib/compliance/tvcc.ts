/**
 * TVCC (Technical Vigilance Cell) compliance builder (PURE, no I/O, unit-tested).
 *
 * TVCC is modelled as ONE engineering-compliance verification, NOT a statute:
 * BBMP administrative instructions / Government Orders / tender conditions
 * require third-party technical-vigilance inspection and quality checks on works
 * of this class. This builder takes the TVCC report references transcribed from
 * the case documents and cross-checks them against records ALREADY on the
 * CaseIntelligence artifact (Schedule-B / BOQ, running bills, quality-related
 * findings) — it never re-parses documents and never invents a value. It feeds
 * the Engineering Compliance Matrix as the TVCC dimension.
 */
import type { TvccReportRef } from "@/lib/ai/extractors/document-facts";
import type {
  TvccCompliance,
  TvccReportItem,
  TvccCrossCheck,
  ScheduleBTables,
  Observation,
} from "@/lib/intelligence/types";

/** The TVCC report types a works file is expected to carry. Ordered specific →
 *  generic: "inspection" is the catch-all and is tested LAST, so "Quality
 *  Inspection Report" classifies as quality and "Site inspection" as site. */
export const EXPECTED_TVCC_TYPES = [
  { key: "quality", label: "TVCC Quality Report", re: /quality|test|material/i },
  { key: "site", label: "TVCC Site Inspection", re: /site/i },
  { key: "rectification", label: "TVCC Rectification Report", re: /rectif|remed/i },
  { key: "compliance", label: "TVCC Compliance Report", re: /complian/i },
  { key: "recommendation", label: "TVCC Recommendations", re: /recommend/i },
  { key: "inspection", label: "TVCC Inspection Report", re: /inspect/i },
] as const;

function clean(s: unknown): string {
  return (s == null ? "" : String(s)).trim().replace(/[–—―]/g, "-").replace(/\|/g, "/");
}

/** Classify a transcribed report into one of the expected TVCC types. */
function classify(r: TvccReportRef): string {
  const hay = `${r.reportType ?? ""} ${r.observation ?? ""} ${r.reference ?? ""}`;
  const hit = EXPECTED_TVCC_TYPES.find((t) => t.re.test(hay));
  return hit ? hit.key : "other";
}

export interface TvccInput {
  reports: TvccReportRef[];
  scheduleBTables: ScheduleBTables | null;
  runningBills: ReadonlyArray<{ billNo?: string | null; thisBill?: number | null; totalUptoDate?: number | null }>;
  findings: ReadonlyArray<Observation>;
  isWorksCase: boolean;
}

/**
 * Build the deterministic TVCC compliance snapshot. Returns null when the case is
 * not a works contract AND no TVCC report is present (the regime does not apply).
 */
export function buildTvccCompliance(input: TvccInput): TvccCompliance | null {
  const raw = (input.reports ?? []).filter(
    (r): r is TvccReportRef => Boolean(r) && Boolean(r.reference || r.reportType || r.observation),
  );
  if (!input.isWorksCase && raw.length === 0) return null;

  const reportsFound: TvccReportItem[] = raw.map((r) => ({
    reportType: classify(r),
    reference: clean(r.reference) || null,
    date: clean(r.date) || null,
    authority: clean(r.authority) || null,
    observation: clean(r.observation) || null,
  }));

  const presentTypes = new Set(reportsFound.map((r) => r.reportType));
  const coverage = EXPECTED_TVCC_TYPES.map((t) => ({ type: t.label, present: presentTypes.has(t.key) }));

  // Cross-checks over records already on the artifact. Each is honest about what
  // it could and could not verify — never asserts a match it cannot see.
  const crossChecks: TvccCrossCheck[] = [];
  const hasBoq = Boolean(input.scheduleBTables && input.scheduleBTables.groups.length);
  const hasBills = input.runningBills.length > 0;
  // Match quality/measurement concerns by AUTHORITATIVE finding CATEGORY only —
  // never by scanning free text (a "material"/"test" word in a QUANTITY finding
  // must not manufacture a TVCC discrepancy).
  const qualityFindings = input.findings.filter((f) => f.category === "MB_INTEGRITY" || f.category === "QUALITY");

  if (reportsFound.length) {
    crossChecks.push({
      against: "Schedule-B / BOQ",
      status: hasBoq ? "not_verifiable" : "not_verifiable",
      detail: hasBoq
        ? "A TVCC report is on record and Schedule-B quantities are available; a line-by-line reconciliation of TVCC-verified quantities against the Schedule-B requires the full measured quantities and is to be confirmed on inspection."
        : "A TVCC report is on record but the Schedule-B quantities are not available on the case to reconcile against; produce both for verification.",
    });
    crossChecks.push({
      against: "Running / final bills",
      status: hasBills ? "not_verifiable" : "not_verifiable",
      detail: hasBills
        ? "Running-bill totals are on record; confirm that quantities/values certified in the bills fall within what the TVCC inspection actually verified."
        : "No running/final bill is on the case to reconcile the TVCC-verified work against.",
    });
    crossChecks.push({
      against: "Quality findings",
      status: qualityFindings.length ? "discrepancy" : "consistent",
      detail: qualityFindings.length
        ? `The audit already flags ${qualityFindings.length} quality/measurement concern(s); the TVCC report(s) must be checked against these and any rectification confirmed.`
        : "No conflicting quality/measurement finding is recorded against the TVCC report(s) on the available records.",
    });
  }

  // Status: discrepancy ONLY on a real cross-check conflict; met if all expected
  // types present with no conflict; not_shown if none present (works case);
  // otherwise "unknown" (some reports on record, no conflict, but not every type)
  // — a partial-but-clean set must NOT be scored worse than having no report.
  const anyDiscrepancy = crossChecks.some((c) => c.status === "discrepancy");
  const allPresent = coverage.every((c) => c.present);
  const status: TvccCompliance["status"] = anyDiscrepancy
    ? "discrepancy"
    : reportsFound.length === 0
      ? "not_shown"
      : allPresent
        ? "met"
        : "unknown";

  const note =
    reportsFound.length === 0
      ? "No TVCC (Technical Vigilance Cell) / third-party quality-inspection report is on record for this works file. TVCC verification is required under the applicable BBMP administrative instructions and tender conditions before the work is certified; produce the TVCC inspection, quality, site, rectification and compliance reports."
      : `TVCC report(s) on record: ${reportsFound.map((r) => [r.reference, r.date].filter(Boolean).join(" dated ")).filter(Boolean).join("; ") || "reference not stated"}. Cross-verify the TVCC-inspected quantities and quality against the Schedule-B, the Measurement Book and the running/final bills before certification; the missing report types (${coverage.filter((c) => !c.present).map((c) => c.type).join(", ") || "none"}) should also be produced.`;

  return { reportsFound, coverage, crossChecks, status, note };
}
