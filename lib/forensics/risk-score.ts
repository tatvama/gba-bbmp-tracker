/**
 * Risk scoring + evidence grading (PURE, unit-tested).
 * Additive model verbatim from the skill: score = SEV + EVD + add-ons + value
 * impact, clamped 0–100, into 4 bands (no "vigilance"). The earlier
 * rule-engine `scoreFindings` (10/4/1) is a SEPARATE, simpler scorer for the
 * single-bill audit and is intentionally not changed.
 */
import {
  RISK_SEV, RISK_EVD, RISK_ADDONS, RISK_VALUE_IMPACT, RISK_BANDS,
} from "../constants";
import type { BillFinding, EvidenceGrade, EvidenceStrength, RiskBand } from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Additive risk points for one finding (clamped 0–100). */
export function scoreFinding(f: BillFinding): number {
  const sev = RISK_SEV[f.severity] ?? RISK_SEV.Medium;
  const strength: EvidenceStrength = f.evidenceStrength ?? "moderate";
  const evd = RISK_EVD[strength] ?? RISK_EVD.moderate;
  let s = sev + evd;
  if (f.findingClass === "missing_proof") s += RISK_ADDONS.missing_proof;
  if (f.category === "CHRONOLOGY") s += RISK_ADDONS.chronology_issue;
  if (f.findingClass === "possible_forgery_redflag") s += RISK_ADDONS.possible_forgery_redflag;
  if (f.valueImpact) s += RISK_VALUE_IMPACT[f.valueImpact];
  return clamp(s);
}

/** Infer an A–E evidence grade when an emitter didn't set one. */
export function gradeEvidence(
  f: Pick<BillFinding, "code" | "detail" | "category" | "findingClass">,
): EvidenceGrade {
  const txt = `${f.code ?? ""} ${f.detail ?? ""}`.toLowerCase();
  if (f.findingClass === "possible_forgery_redflag" || /signature|seal|stamp|notar|metadata|forg/.test(txt)) return "D";
  if (f.category === "PHOTO" || /core|thickness|marshall|density|\bgps\b|site inspection/.test(txt)) return "E";
  if (f.findingClass === "missing_proof" || /not supplied|not shown|missing|no .* (record|deduction|recovery)/.test(txt)) return "C";
  if (f.findingClass === "confirmed_mismatch" || f.category === "CHRONOLOGY") return "A";
  if (/percent|%|calculated|variance|expected|× rate|qty ×/.test(txt) || f.category === "ARITHMETIC" || f.category === "DEDUCTION" || f.category === "RATE" || f.category === "QUANTITY") return "B";
  return "C";
}

export function bandFor(score: number): RiskBand {
  for (const b of RISK_BANDS) if (score >= b.min) return b.band as RiskBand;
  return "low";
}

export function bandLabel(band: RiskBand): string {
  return RISK_BANDS.find((b) => b.band === band)?.label ?? band;
}

export interface JobRisk {
  score: number;
  band: RiskBand;
  byCategory: Record<string, number>;
}

/** Aggregate a job's findings into a clamped score + band + per-category totals. */
export function scoreJobRisk(findings: BillFinding[]): JobRisk {
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const f of findings) {
    const pts = f.riskPoints ?? scoreFinding(f);
    total += pts;
    const cat = f.category ?? "OTHER";
    byCategory[cat] = (byCategory[cat] ?? 0) + pts;
  }
  const score = clamp(total);
  return { score, band: bandFor(score), byCategory };
}
