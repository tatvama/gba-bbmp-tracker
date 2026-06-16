/**
 * Evidence-block builder: turns a forensic finding into a Kannada "ground" with
 * the mandatory 7 labels (+ optional worked-example / grade / risk).
 */
import type { LetterFinding, RenderedGround, RenderedGroundLabel } from "./types";
import { GROUND_FIELD_LABELS } from "./letter-knowledge";

/** Fields that MUST be present for a finding to become a serious ground. */
const REQUIRED_FIELDS: Array<keyof LetterFinding> = ["docRef", "observation", "suspicionReason", "recordDemand"];

/** True when a finding has enough substance to stand as a numbered ground. */
export function isGroundReady(f: LetterFinding): boolean {
  return REQUIRED_FIELDS.every((k) => {
    const v = f[k];
    return typeof v === "string" ? v.trim().length > 0 : v != null;
  });
}

function valueFor(f: LetterFinding, field: string): string {
  const raw = (f as unknown as Record<string, unknown>)[field];
  if (raw == null) return "";
  return String(raw).trim();
}

/** Build one numbered ground with its ordered labels. */
export function buildGround(f: LetterFinding, number: number): RenderedGround {
  const labels: RenderedGroundLabel[] = [];
  for (const { field, label, styleKey, optional } of GROUND_FIELD_LABELS) {
    const value = valueFor(f, field);
    if (!value && optional) continue; // optional labels only when present
    if (!value && field !== "mismatch" && field !== "ruleBasis" && field !== "responsibleOfficer") {
      // a required-ish field with no value: still emit the label with a demand-for-records placeholder
      labels.push({ label, value: "ಸಂಬಂಧಿತ ಮೂಲ ದಾಖಲೆಯ ಹಾಜರಾತಿ ಅಗತ್ಯವಿದೆ", styleKey });
      continue;
    }
    if (!value) continue;
    labels.push({ label, value, styleKey });
  }
  return { number, title: f.title, labels };
}

/** Build all grounds from the High/Medium, ground-ready findings (sorted by risk). */
export function buildGrounds(findings: LetterFinding[]): RenderedGround[] {
  return [...findings]
    .filter((f) => f.severity !== "Low" && isGroundReady(f))
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .map((f, i) => buildGround(f, i + 1));
}

export { buildSummaryBox } from "./tables";
