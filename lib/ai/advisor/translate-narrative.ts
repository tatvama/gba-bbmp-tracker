import "server-only";
import type { DbClient } from "@/lib/db";
import { translateToKannada, translateToEnglish } from "@/lib/ai/translate";
import type { AdvisorLanguage, NarrativeSnapshot } from "./types";

/**
 * Derive a narrative snapshot in `target` from an already-generated one by
 * TRANSLATING its human-readable strings — the advisor reasons once (in English)
 * and the other language is a cheap, cached translation rather than a second
 * full AI reasoning run. Enum, status, date and numeric fields (confidence,
 * recommendation_action, statuses, dates, counts) are carried over untouched.
 * Every translation is cached in translation_cache, so a repeat is free.
 */
export async function translateNarrative(
  admin: DbClient,
  snap: NarrativeSnapshot,
  target: AdvisorLanguage,
): Promise<NarrativeSnapshot> {
  const texts: string[] = [];
  const collect = (s: string | null | undefined) => { if (s && s.trim()) texts.push(s); };
  collect(snap.current_situation);
  collect(snap.reasoning);
  collect(snap.expected_outcome);
  collect(snap.recommendation);
  collect(snap.timeline_summary);
  snap.missing_information.forEach(collect);
  snap.detected_risks.forEach(collect);
  snap.outstanding_issues.forEach((o) => collect(o.issue));
  snap.contradictions.forEach((c) => { collect(c.summary); collect(c.conflictsWith); });
  snap.commitments.forEach((m) => collect(m.commitment));

  const map = target === "kn"
    ? await translateToKannada(admin, texts)
    : await translateToEnglish(admin, texts);
  // Every non-empty input is present in the map; fall back to the original.
  const tr = (s: string | null | undefined): string | null => {
    const t = (s ?? "").trim();
    if (!t) return s ?? null;
    return map.get(t) ?? s ?? null;
  };
  const trStr = (s: string): string => tr(s) ?? s;

  return {
    ...snap,
    current_situation: tr(snap.current_situation),
    reasoning: tr(snap.reasoning),
    expected_outcome: tr(snap.expected_outcome),
    recommendation: tr(snap.recommendation),
    timeline_summary: tr(snap.timeline_summary),
    missing_information: snap.missing_information.map(trStr),
    detected_risks: snap.detected_risks.map(trStr),
    outstanding_issues: snap.outstanding_issues.map((o) => ({ ...o, issue: trStr(o.issue) })),
    contradictions: snap.contradictions.map((c) => ({ ...c, summary: trStr(c.summary), conflictsWith: trStr(c.conflictsWith) })),
    commitments: snap.commitments.map((m) => ({ ...m, commitment: trStr(m.commitment) })),
    // confidence / confidence_score / recommendation_action /
    // analyzed_correspondence_count carried over unchanged (…snap above).
  };
}
