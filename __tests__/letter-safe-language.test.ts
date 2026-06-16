import { describe, it, expect } from "vitest";
import { applySafeLanguage, stripKannadaDashes, lintLetter, sanitizeDraft } from "../lib/letters/safe-language";

describe("safe-language transformer", () => {
  it("rewrites accusatory English into cautious phrasing", () => {
    const out = applySafeLanguage("The contractor committed fraud and forged the bill.");
    expect(out).not.toMatch(/\bfraud\b/i);
    expect(out).toMatch(/apparent irregularity|requires expert verification/i);
  });

  it("keeps dashes inside job codes but strips them from prose", () => {
    const out = stripKannadaDashes("ಕೆಲಸ ಸಂಕೇತ 222-12-345678 ರ ಬಿಲ್ — ಪರಿಶೀಲನೆ ಅಗತ್ಯ");
    expect(out).toContain("222-12-345678"); // identifier preserved
    expect(out).not.toMatch(/[–—―]/); // em/en dash removed from prose
  });
});

describe("lintLetter (hard safety gate)", () => {
  it("HARD-FAILS English accusations", () => {
    const r = lintLetter("The engineer embezzled public money.");
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.kind === "accusation")).toBe(true);
  });

  it("HARD-FAILS Kannada accusations (ಮೋಸ ಮಾಡಿದ್ದಾರೆ)", () => {
    const r = lintLetter("ಗುತ್ತಿಗೆದಾರ ಮೋಸ ಮಾಡಿದ್ದಾರೆ ಎಂದು ತಿಳಿದುಬಂದಿದೆ.");
    expect(r.ok).toBe(false);
  });

  it("passes cautious, documented-suspicion prose", () => {
    const r = lintLetter("ಸರಬರಾಜು ಮಾಡಿದ ದಾಖಲೆಗಳ ಆಧಾರದ ಮೇಲೆ ಸಂದೇಹ ಕಂಡುಬಂದಿದ್ದು ಮೂಲ ದಾಖಲೆ ಕೋರಲಾಗಿದೆ.");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("does NOT flag the job code dashes as prose dashes", () => {
    const r = lintLetter("ಕೆಲಸ ಸಂಕೇತ 222-12-345678 ರ ಪರಿಶೀಲನೆ ಕೋರಲಾಗಿದೆ.");
    expect(r.warnings.filter((w) => w.kind === "dash")).toHaveLength(0);
  });

  it("sanitizeDraft converts then passes the gate", () => {
    const { text, lint } = sanitizeDraft("The bill is fraudulent — verify the records.");
    expect(lint.ok).toBe(true);
    expect(text).not.toMatch(/[–—―]/);
  });
});
