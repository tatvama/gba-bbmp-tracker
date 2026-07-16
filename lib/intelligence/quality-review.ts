import "server-only";
import { sanitizeDraft } from "@/lib/letters/safe-language";
import type { CaseIntelligence } from "./types";

/**
 * Stage 11 — Quality Review. After a draft is produced, verify it actually covers
 * the intelligence: every High/Medium finding (by code or statement) and every
 * "document to demand" should appear; re-run the safe-language lint; surface the
 * groundedness result. Returns a quality report (never mutates the draft).
 */
export interface QualityReport {
  coveragePct: number;
  totalKeyFindings: number;
  missingFindings: string[];
  missingDemands: string[];
  ungroundedObservations: number;
  lintOk: boolean;
  lintErrors: string[];
  notes: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

export function reviewDraft(text: string, intel: CaseIntelligence): QualityReport {
  const hay = norm(text);
  const keyFindings = [...intel.findings, ...intel.correlations].filter((f) => f.severity === "High" || f.severity === "Medium");

  const missingFindings: string[] = [];
  for (const f of keyFindings) {
    const byCode = f.code ? hay.includes(f.code.toLowerCase()) : false;
    const byText = norm(f.statement).slice(0, 40).length > 10 && hay.includes(norm(f.statement).slice(0, 40));
    if (!byCode && !byText) missingFindings.push(f.code ?? f.statement.slice(0, 50));
  }

  const missingDemands: string[] = [];
  for (const d of intel.synthesis.documentsToDemand) {
    const probe = norm(d).slice(0, 24);
    if (probe.length > 8 && !hay.includes(probe)) missingDemands.push(d.slice(0, 60));
  }

  const total = keyFindings.length;
  const covered = total - missingFindings.length;
  const coveragePct = total === 0 ? 100 : Math.round((covered / total) * 100);

  const { lint } = sanitizeDraft(text);
  const notes: string[] = [];
  if (missingFindings.length) notes.push(`${missingFindings.length}/${total} key findings not clearly reflected in the letter`);
  if (missingDemands.length) notes.push(`${missingDemands.length} documents-to-demand not mentioned`);
  if (!intel.verification.passed) notes.push(`${intel.verification.ungroundedClaims.length} ungrounded observation(s) in the intelligence artifact`);

  return {
    coveragePct,
    totalKeyFindings: total,
    missingFindings,
    missingDemands,
    ungroundedObservations: intel.verification.ungroundedClaims.length,
    lintOk: lint.ok,
    lintErrors: lint.ok ? [] : lint.errors.map((e) => e.reason),
    notes,
  };
}
