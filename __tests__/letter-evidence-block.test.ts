import { describe, it, expect } from "vitest";
import { buildGround, buildGrounds, isGroundReady } from "../lib/letters/evidence-block";
import type { LetterFinding } from "../lib/letters/types";

const full: LetterFinding = {
  code: "QT-OVERRUN",
  title: "Quantity over the 125% cap",
  severity: "High",
  docRef: "Annexure A-1, MB page 12, item 5",
  observation: "WMM cumulative 1420 cum vs tendered 470 cum (302%)",
  mismatch: "No sanctioned modified Schedule-B on file",
  suspicionReason: "Excess quantity without sanction inflates the bill",
  workedExample: "470 × 1.25 = 587.5 cum allowed; 1420 − 587.5 = 832.5 cum unsupported",
  ruleBasis: "PWD Code quantity-variation limit",
  recordDemand: "Sanctioned modified Schedule-B and approval order",
  responsibleOfficer: "Assistant Engineer (AE)",
  evidenceGrade: "E",
  riskScore: 70,
};

describe("evidence-block buildGround", () => {
  it("emits the 7 required labels plus the worked example", () => {
    const g = buildGround(full, 1);
    const labels = g.labels.map((l) => l.label);
    for (const req of [
      "ದಾಖಲೆ ಆಧಾರ",
      "ಕಂಡುಬಂದ ಅಂಶ",
      "ಮಿಸ್‌ಮ್ಯಾಚ್ ಅಥವಾ ಕೊರತೆ",
      "ಸಂದೇಹಕ್ಕೆ ಕಾರಣ",
      "ನಿಯಮ ಅಥವಾ ಕಾನೂನು ಆಧಾರ",
      "ಬೇಕಾಗಿರುವ ದಾಖಲೆ",
      "ಜವಾಬ್ದಾರಿ ಸ್ಪಷ್ಟನೆ ನೀಡಬೇಕಾದವರು",
    ]) {
      expect(labels).toContain(req);
    }
    expect(labels).toContain("ಸರಳ ಉದಾಹರಣೆ"); // worked example
    expect(g.number).toBe(1);
  });

  it("omits optional labels when absent", () => {
    const lean: LetterFinding = { ...full, workedExample: undefined, riskScore: undefined, evidenceGrade: undefined };
    const g = buildGround(lean, 2);
    const labels = g.labels.map((l) => l.label);
    expect(labels).not.toContain("ಸರಳ ಉದಾಹರಣೆ");
    expect(labels).not.toContain("ಅಪಾಯ ಅಂಕ");
  });

  it("drops findings missing the core fields and Low severity", () => {
    const incomplete: LetterFinding = { code: "X", title: "x", severity: "High", observation: "y" };
    const low: LetterFinding = { ...full, severity: "Low" };
    expect(isGroundReady(incomplete)).toBe(false);
    const grounds = buildGrounds([full, incomplete, low]);
    expect(grounds).toHaveLength(1);
    expect(grounds[0]!.title).toBe(full.title);
  });
});
