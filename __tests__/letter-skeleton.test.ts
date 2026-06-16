import { describe, it, expect } from "vitest";
import { assembleSkeleton, resolveSignatory, skeletonToPlainText, letterFileName } from "../lib/letters/letter-skeleton";
import { lintLetter } from "../lib/letters/safe-language";
import type { LetterContext, LetterFinding } from "../lib/letters/types";

const findings: LetterFinding[] = [
  { code: "QT-OVERRUN", title: "Quantity overrun", severity: "High", docRef: "Annexure A-1, page 12, item 5", observation: "302% of tender", mismatch: "No modified Schedule-B", suspicionReason: "Excess without sanction inflates the bill", workedExample: "470 × 1.25 = 587.5 allowed", ruleBasis: "PWD Code", recordDemand: "Modified Schedule-B", responsibleOfficer: "Assistant Engineer (AE)", evidenceGrade: "E", riskScore: 70 },
  { code: "RATE-ABOVE-SR", title: "Rate above SR", severity: "Medium", docRef: "Annexure A-2, item 7", observation: "₹620 vs SR ₹500", suspicionReason: "Payment beyond sanctioned rate", recordDemand: "Rate analysis", responsibleOfficer: "AEE", evidenceGrade: "C", riskScore: 35 },
];

const ctx: LetterContext = {
  jobCode: "222-12-345678",
  ward: "174",
  workName: "Road asphalting, 5th Cross",
  contractor: "ABC Infra",
  division: "South Division",
  variant: "bill_stop",
  language: "Kannada",
  signatoryKey: "raghav_gowda",
  findings,
};

describe("letter skeleton", () => {
  it("assembles a full skeleton with grounds, evidence index and officer table", () => {
    const sk = assembleSkeleton(ctx);
    expect(sk.grounds.length).toBe(2);
    expect(sk.evidenceIndex.length).toBe(2);
    expect(sk.officerResponsibility.length).toBeGreaterThan(0);
    expect(sk.summaryBox.length).toBe(2);
    expect(sk.references.some((r) => r.includes("222-12-345678"))).toBe(true);
  });

  it("never signs on behalf of Guruji / the Trust", () => {
    const s = resolveSignatory("raghav_gowda");
    expect(s.name).not.toMatch(/guruji|samsthana|trust/i);
    // the signatory list contains no Guruji/Trust key at all
    expect(() => resolveSignatory("sharath_babu")).not.toThrow();
    expect(() => resolveSignatory("sai_raghav")).not.toThrow();
  });

  it("plain-text render passes the safe-language gate", () => {
    const txt = skeletonToPlainText(assembleSkeleton(ctx));
    expect(lintLetter(txt).ok).toBe(true);
  });

  it("builds a safe download filename tied to the signatory + job code", () => {
    const name = letterFileName(ctx);
    expect(name).toBe("BillStop_222-12-345678_Raghav_Gowda");
  });

  it("RTI variant addresses the PIO and demands certified copies", () => {
    const sk = assembleSkeleton({ ...ctx, variant: "rti" });
    expect(sk.toBlock.join(" ")).toMatch(/PIO|ಮಾಹಿತಿ ಅಧಿಕಾರಿ/);
    expect(sk.demands.join(" ")).toMatch(/ಪ್ರಮಾಣೀಕೃತ|ನಕಲು/);
  });
});
