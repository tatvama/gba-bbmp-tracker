import { describe, it, expect } from "vitest";
import { suspicionsToFindings, flagSummaryForCodes } from "../lib/letters/from-suspicions";
import { buildGrounds, buildSummaryBox } from "../lib/letters/evidence-block";
import { assembleSkeleton, skeletonToPlainText } from "../lib/letters/letter-skeleton";
import { lintLetter } from "../lib/letters/safe-language";
import type { LetterContext } from "../lib/letters/types";

describe("suspicions → findings", () => {
  it("maps RED/ORANGE/AMBER → High/Medium/Low", () => {
    const f = suspicionsToFindings({ codes: ["Q1", "Q3", "Q7"] }); // RED, ORANGE, AMBER
    const sev = Object.fromEntries(f.map((x) => [x.code.split("-").pop(), x.severity]));
    expect(sev["Q1"]).toBe("High");
    expect(sev["Q3"]).toBe("Medium");
    expect(sev["Q7"]).toBe("Low");
  });

  it("findings feed the summary box + grounds without throwing", () => {
    const f = suspicionsToFindings({ codes: ["Q18", "Q33", "Q66"], notes: { Q18: "Item 5 billed at 125%" } });
    expect(() => buildSummaryBox(f)).not.toThrow();
    expect(buildGrounds(f).length).toBeGreaterThan(0); // RED grounds are ground-ready
  });

  it("tallies the flag summary", () => {
    expect(flagSummaryForCodes(["Q1", "Q3", "Q7"])).toEqual({ red: 1, orange: 1, amber: 1 });
  });
});

describe("skeleton recipient / sender overrides", () => {
  const base: LetterContext = {
    jobCode: "225-12-345678",
    variant: "bill_stop",
    language: "Kannada",
    signatoryKey: "raghav_gowda",
    findings: suspicionsToFindings({ codes: ["Q18", "Q66"] }),
    references: [],
  };

  it("explicit recipient overrides the hardcoded block; cc chain renders", () => {
    const sk = assembleSkeleton({
      ...base,
      recipient: { name: "Executive Engineer", office: "South Division, BBMP / GBA" },
      ccChain: [{ name: "Karnataka Lokayukta", office: "Bengaluru" }],
    });
    expect(sk.toBlock.join(" ")).toContain("Executive Engineer");
    expect(sk.ccBlock.length).toBe(1);
    expect(skeletonToPlainText(sk)).toContain("ಪ್ರತಿ (Copy to)");
  });

  it("falls back to the hardcoded recipient when none supplied", () => {
    const sk = assembleSkeleton(base);
    expect(sk.toBlock.length).toBeGreaterThan(0);
    expect(sk.ccBlock.length).toBe(0);
  });

  it("uses a custom sender, but rejects a Trust / Samsthana sender", () => {
    const sk = assembleSkeleton({ ...base, customSender: { name: "K. Citizen", address: "MG Road, Bengaluru" } });
    expect(sk.fromBlock.join(" ")).toContain("K. Citizen");
    expect(() =>
      assembleSkeleton({ ...base, customSender: { name: "Sri Sai Samsthana Trust", address: "x" } }),
    ).toThrow();
  });

  it("renders the flag summary + loss box and stays lint-clean", () => {
    const sk = assembleSkeleton({
      ...base,
      flagSummary: { red: 2, orange: 1, amber: 0 },
      lossBox: {
        definiteFigures: "₹1,00,000",
        definiteWords: "Rupees One Lakh only",
        suspectedFigures: "₹0",
        suspectedWords: "Nil",
        lines: [{ label: "125% excess quantity", figures: "₹1,00,000" }],
      },
    });
    const txt = skeletonToPlainText(sk);
    expect(txt).toContain("RED 2");
    expect(txt).toContain("ನಷ್ಟ ಲೆಕ್ಕ");
    expect(lintLetter(txt).ok).toBe(true);
  });
});
