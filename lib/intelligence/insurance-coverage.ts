/**
 * Deterministic KW-4 Clause 13 insurance-coverage table builder (PURE, no I/O,
 * framework-free — unit-tested like lib/complaints/escalation-cycle.ts).
 *
 * The Karnataka PWD KW-4 standard tender document (Section 4 — General Conditions
 * of Contract, Clause 13.1) requires the contractor to carry, in the joint names
 * of the Employer and the Contractor, a FIXED set of insurance covers from the
 * first working day after the Start Date until the end of the Defects Liability
 * Period. This module builds the canonical "Type of Cover | Minimum Cover
 * Required Under KW-4 | Status" compliance table that a Lokayukta complaint /
 * legal notice / counter-reply must carry (the format the reference letter uses).
 *
 * The cover types and their minimum-cover requirements are FIXED by KW-4; only
 * the "Works, Plant and Materials" minimum (agreement value + 20%) and the per-
 * row Status are case-specific. Kept deterministic on purpose: the AI drafter
 * reproduces this table verbatim and must never invent the cover types, the 20%
 * margin, or the sums. See lib/forensics/insurance-security.ts for the parallel
 * forensic finding checks (IN-*) that operate on already-parsed policies.
 */
import { groupIndian } from "@/lib/format-inr";
import type { DocRefItem } from "@/lib/ai/extractors/document-facts";
import type { InsuranceCoverage, InsuranceCoverRow } from "./types";

/** KW-4 13.1(a): the Works/Plant/Materials cover must be the agreement value + 20%. */
const WORKS_MARGIN = 0.2;

/**
 * Parse an Indian-format rupee string ("Rs. 19,28,41,746.62", "₹1,23,456/-",
 * "19,28,41,746") to a positive number, or null when no usable figure is present.
 * Deliberately local (a 4-line pure parser) rather than importing the IFMS
 * downloader's parseAmount — that module is not something the intelligence
 * pipeline should pull into its bundle.
 */
export function parseRupees(s: string | null | undefined): number | null {
  if (!s) return null;
  const str = String(s);
  // Match the first rupee-number token on the ORIGINAL string, so spaces,
  // parentheses and letters act as delimiters. (Char-stripping first would fuse
  // an amount into an adjacent number/date, e.g. "Rs. 1,23,45,678 (01.01.2020)"
  // -> "12345678 01.01.2020" -> 1234567801.01.) Grouping commas are kept inside.
  const m = str.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  // Apply an Indian scale word immediately following the number ("19.28 Crore",
  // "45 Lakh", "2 thousand"): BBMP/PWD documents routinely state contract values
  // in words, and the fact extractor transcribes them verbatim, so without this
  // "Rs. 19.28 Crore" would parse to 19.28 and print an absurd +20% figure.
  const after = str.slice((m.index ?? 0) + m[0].length).toLowerCase();
  if (/^\s*cr(?:ore)?s?\b/.test(after)) n *= 1e7;
  else if (/^\s*la(?:kh|c)s?\b/.test(after)) n *= 1e5;
  else if (/^\s*thousand\b/.test(after)) n *= 1e3;
  return n;
}

/** "19,28,41,746.62" — Indian grouping, keeping up to 2 decimals when present. */
function formatRupees(n: number): string {
  const whole = Math.floor(n);
  const paise = Math.round((n - whole) * 100);
  const base = groupIndian(whole);
  return paise > 0 ? `${base}.${String(paise).padStart(2, "0")}` : base;
}

export interface InsuranceCoverInput {
  /** Every insurance-policy reference transcribed from the case documents. */
  policies: DocRefItem[];
  /** Parsed agreement/contract value in rupees (the +20% base), if known. */
  agreementValue: number | null;
  /** The verbatim agreement-value string as extracted, for faithful display. */
  agreementValueRaw?: string | null;
  /** A works contract (job number / agreement present) — the table only applies then. */
  isWorksCase: boolean;
}

/** Everything about a policy that identifies it, for keyword matching + display. */
function haystack(p: DocRefItem): string {
  return [p.policyType, p.insurer, p.number, p.extra].filter(Boolean).join(" ");
}
function describePolicy(p: DocRefItem): string {
  return [
    p.number ? `Policy No. ${p.number}` : "",
    p.insurer,
    p.policyType,
    p.validFrom || p.validTo ? `valid ${p.validFrom ?? "?"} to ${p.validTo ?? "?"}` : "",
    p.amount ? `sum insured Rs. ${p.amount}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Build the KW-4 Clause 13 insurance-coverage table for a case. Returns null when
 * the case is not a works contract (no job number, no agreement value, and no
 * insurance policy on record) — the KW-4 insurance regime does not apply to, say,
 * a plain pothole/garbage complaint, so we emit nothing rather than noise.
 */
export function buildInsuranceCoverageTable(input: InsuranceCoverInput): InsuranceCoverage | null {
  const policies = (input.policies ?? []).filter(
    (p): p is DocRefItem => Boolean(p) && Boolean(p.number || p.insurer || p.policyType || p.amount),
  );
  if (!input.isWorksCase && input.agreementValue == null && policies.length === 0) return null;

  const av = input.agreementValue;
  const worksMin =
    av != null
      ? `Agreement value plus 20% (approximately Rs. ${groupIndian(Math.round(av * (1 + WORKS_MARGIN)))} on this Agreement of Rs. ${
          input.agreementValueRaw?.trim() || formatRupees(av)
        })`
      : "Agreement value plus 20%";

  // The FIXED KW-4 Clause 13.1 cover types, in the order the standard lists them.
  // `keywords` (any-match) decides whether an extracted policy evidences that
  // specific cover (the Status column). Cell text avoids en/em dashes (the
  // safe-language gate rewrites those in the final draft) so the table renders
  // cleanly. Acronyms (CAR/EAR/CPM/TPL/WC) are matched CASE-SENSITIVELY so an
  // unrelated motor "Private Car" or an equipment-only "CPM" policy does not
  // false-light the Works row.
  const spec: { coverType: string; minimumRequired: string; keywords: RegExp[] }[] = [
    {
      coverType: "Works, Plant and Materials",
      minimumRequired: worksMin,
      keywords: [/\bCAR\b/, /\bEAR\b/, /\ball[-\s]?risks?\b/i, /erection/i, /works?\s*insurance/i, /material\s*damage/i],
    },
    {
      coverType: "Loss or damage to Contractor's Equipment",
      minimumRequired: "Full replacement cost",
      keywords: [/equipment/i, /machinery/i, /\bplant\b/i, /\bCPM\b/],
    },
    {
      coverType: "Loss or damage to property of third party",
      minimumRequired: "Full replacement cost",
      keywords: [/third[-\s]?part/i, /public\s*liabilit/i, /\bTPL\b/, /property\s*damage/i],
    },
    {
      coverType: "Personal injury or death (third party)",
      minimumRequired: "As per KW-4 Clause 13.1(b)",
      keywords: [/third[-\s]?part/i, /public\s*liabilit/i, /\bTPL\b/, /personal\s*injur/i, /bodily/i],
    },
    {
      coverType: "Personal injury or death (contractor's employees and labour)",
      minimumRequired:
        "Statutory cover under the Workmen's Compensation Act, 1923 (invoked by Agreement Clause 6)",
      keywords: [/workm[ae]n/i, /\bWC\b/, /employee/i, /labou?r/i, /compensation/i],
    },
  ];

  const rows: InsuranceCoverRow[] = spec.map((s) => {
    const match = policies.find((p) => {
      const h = haystack(p);
      return s.keywords.some((re) => re.test(h));
    });
    return {
      coverType: s.coverType,
      minimumRequired: s.minimumRequired,
      status: match ? `On record (${describePolicy(match)})` : "Not on record",
    };
  });

  const note = policies.length
    ? `Insurance policies visible in the record: ${policies
        .map(describePolicy)
        .join("; ")}. KW-4 Clause 13.2 requires the policies and certificates of insurance to be delivered to the Employer before commencement of the work; Clause 13.3 empowers the Employer, on the contractor's default, to itself take out the insurance and recover the premium from the contractor's dues.`
    : "No insurance policy, premium receipt or certificate of insurance is visible in any document supplied for this case. KW-4 Clause 13.2 requires these to be delivered to the Employer before commencement of the work, and Clause 13.3 empowers the Employer to itself insure and recover the premium on the contractor's default.";

  return {
    rows,
    agreementValue: input.agreementValueRaw?.trim() || (av != null ? `Rs. ${formatRupees(av)}` : null),
    policiesFound: policies.length,
    ruleRef: "KW-4 Standard Tender Document, Section 4 (General Conditions of Contract), Clause 13 (Insurance)",
    note,
  };
}
