/**
 * Smart pre-select engine — deterministic keyword → 180-bank suspicion mapping.
 *
 * Given a free-text summary or an OCR'd work-order extract, pick the suspicion
 * codes whose pattern the facts plausibly raise. Conservative and high-precision:
 * one rule per section so all 17 are reachable, plus a small always-on baseline so
 * even a thin summary yields a useful draft. Pure — safe for web + MCP.
 *
 * The optional AI assist (lib/actions/ai.ts → suggestSuspicions) is merged on top.
 */
import { ROAD_WORK_180_BY_CODE } from "./road-work-questions";
import type { Severity180 } from "./road-work-knowledge";

export interface SuspicionMatch {
  code: string;
  sectionId: string;
  severity: Severity180;
  /** Why this was pre-selected (shown next to the question in the review step). */
  reason: string;
}

interface KeywordRule {
  re: RegExp;
  codes: string[];
  reason: string;
}

/**
 * High-precision keyword rules, one cluster per section (S1..S17). Each pattern
 * anchors with a leading \b and matches stems as prefixes (e.g. "royalt" inside
 * "royalty"); short ambiguous tokens (ld, eot, l1, gst…) keep their own \b…\b.
 */
const KEYWORD_RULES: KeywordRule[] = [
  { re: /\b(arithmetic|calculat\w*|gross amount|deduction\w*|\bgst\b|round\w*|grand total)/i, codes: ["Q1", "Q2", "Q4", "Q5"], reason: "Bill arithmetic / totals mentioned" },
  { re: /\b(rate|sch-?b|schedule[ -]?b|tender rate|inflat\w*|overpric\w*)/i, codes: ["Q6", "Q10"], reason: "Rate / tender-rate concern" },
  { re: /\b(125|quantity (increase|escalat\w*)|excess quantity|over-?run|variation|modified schedule)/i, codes: ["Q13", "Q14", "Q16", "Q18", "Q24"], reason: "Quantity escalation / 125% limit" },
  { re: /\b(thick\w*|core ?cut\w*|gsb|wmm|dbm|bc overlay|overlay|layer|cross-?section)/i, codes: ["Q30", "Q32", "Q33", "Q35"], reason: "Layer thickness / area concern" },
  { re: /\b(ward|location|job ?code|job ?number|wrong (place|location)|chainage)/i, codes: ["Q39", "Q41", "Q43", "Q46"], reason: "Ward / location match" },
  { re: /\b(quality|marshall|bitumen content|density|compaction|qap|cbr|material test|core cut\w*)/i, codes: ["Q47", "Q48", "Q49", "Q58", "Q59"], reason: "Quality-test records" },
  { re: /\b(delay\w*|\blate\b|\bld\b|liquidated|penalty|completion date|extension of time|\beot\b)/i, codes: ["Q64", "Q65", "Q66", "Q70"], reason: "Time delay / liquidated damages" },
  { re: /\b(agreement|signature\w*|blank sign\w*|pwg|stamp paper|\bemd\b|bank guarantee|performance security)/i, codes: ["Q72", "Q76", "Q77", "Q78", "Q80"], reason: "Document / contract completeness" },
  { re: /\b(salvage|dismantl\w*|debris|excavat\w*|soil|trip sheet|dumping|lorry)/i, codes: ["Q83", "Q84", "Q86", "Q88", "Q90"], reason: "Salvage / soil disposal" },
  { re: /\b(tender|bidder|bid rigging|e-?proc\w*|cartel|\bl1\b|blacklist\w*|sublet\w*|eligibilit\w*)/i, codes: ["Q92", "Q95", "Q97", "Q98", "Q100"], reason: "Tender / contractor eligibility" },
  { re: /\b(insurance|car policy|workmen|\blwf\b|cess|\bcbf\b|labour|labor)/i, codes: ["Q103", "Q106", "Q107", "Q111", "Q112"], reason: "Insurance / labour welfare" },
  { re: /\b(geo-?tag\w*|gps|map camera|photo\w*|picture\w*|image\w*|before.?after|timestamp|morph\w*|photoshop)/i, codes: ["Q113", "Q114", "Q116", "Q119", "Q121", "Q122"], reason: "Photo / geo-tag verification" },
  { re: /\b(road cutting|cutting fee|ofc-?ims|restoration|bwssb|bescom|gail|dig up)/i, codes: ["Q125", "Q128", "Q130", "Q133"], reason: "Road-cutting permission" },
  { re: /\b(ngt|environment\w*|kspcb|buffer zone|lake|storm-?water|tree felling|dust|pollut\w*)/i, codes: ["Q136", "Q137", "Q140", "Q142"], reason: "Environment / NGT" },
  { re: /\b(royalt\w*|\bdmg\b|jelly|m-?sand|\bsand\b|aggregate|mining|material source)/i, codes: ["Q145", "Q146", "Q150", "Q151"], reason: "Royalty / materials" },
  { re: /\b(duplicate\w*|fake|twice|ghost|paper-?only|not done|no (actual )?work|recycl\w*|reused)/i, codes: ["Q153", "Q155", "Q156", "Q158", "Q160"], reason: "Fake works / duplicate bills" },
  { re: /\b(tvcc|vigilance|test check|pre-?payment|internal audit)/i, codes: ["Q161", "Q163", "Q167"], reason: "TVCC / pre-payment check" },
  { re: /\b(payment\w*|already paid|pending|recover\w*|stop payment|public loss)/i, codes: ["Q171", "Q173"], reason: "Payment status / recovery" },
];

/**
 * Always-included baseline (recovery + records + escalation spine) so a draft is
 * useful even from a one-line summary. Q173 = definite loss (RED); Q76/Q77 = MB
 * page integrity & signatures (ORANGE); Q175/Q178 = records to seek + escalation.
 */
const BASELINE_CODES = ["Q173", "Q76", "Q77", "Q175", "Q178"];

const SEV_RANK: Record<Severity180, number> = { RED: 0, ORANGE: 1, AMBER: 2 };
function numCode(c: string): number {
  return Number(c.replace(/^Q/, "")) || 0;
}

/** Map free-text facts to ranked suspicion matches (RED → ORANGE → AMBER). */
export function preselectSuspicions(text: string): SuspicionMatch[] {
  const hay = text ?? "";
  const chosen = new Map<string, string>(); // code → reason

  for (const code of BASELINE_CODES) {
    if (!chosen.has(code)) chosen.set(code, "Baseline audit point (always reviewed)");
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(hay)) {
      for (const code of rule.codes) {
        if (!chosen.has(code)) chosen.set(code, rule.reason);
      }
    }
  }

  const out: SuspicionMatch[] = [];
  for (const [code, reason] of chosen) {
    const entry = ROAD_WORK_180_BY_CODE[code];
    if (!entry) continue; // guards against a typo in the rule table
    out.push({ code, sectionId: entry.section.id, severity: entry.question.severity, reason });
  }
  out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || numCode(a.code) - numCode(b.code));
  return out;
}

/** Merge AI-suggested codes into a deterministic set (union, dedup, re-ranked). */
export function mergeSuspicions(base: SuspicionMatch[], aiCodes: string[]): SuspicionMatch[] {
  const seen = new Set(base.map((m) => m.code));
  const merged = [...base];
  for (const code of aiCodes) {
    if (seen.has(code)) continue;
    const entry = ROAD_WORK_180_BY_CODE[code];
    if (!entry) continue;
    seen.add(code);
    merged.push({ code, sectionId: entry.section.id, severity: entry.question.severity, reason: "AI-suggested from the facts" });
  }
  merged.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || numCode(a.code) - numCode(b.code));
  return merged;
}
