import { describe, it, expect } from "vitest";
import { inrFiguresAndWords, numberToWordsIndian, groupIndian } from "../lib/format-inr";

describe("INR figures + words", () => {
  it("zero", () => {
    const r = inrFiguresAndWords(0);
    expect(r.figures).toBe("₹0");
    expect(r.words).toBe("Rupees Zero only");
  });

  it("one lakh — figures and words", () => {
    const r = inrFiguresAndWords(100000);
    expect(r.figures).toBe("₹1,00,000");
    expect(r.words).toBe("Rupees One Lakh only");
  });

  it("Indian crore grouping", () => {
    expect(groupIndian(12345678)).toBe("1,23,45,678");
    const r = inrFiguresAndWords(12345678);
    expect(r.figures).toBe("₹1,23,45,678");
    expect(r.words).toContain("One Crore");
    expect(r.words).toContain("Twenty Three Lakh");
    expect(r.words).toContain("Forty Five Thousand");
    expect(r.words).toContain("Six Hundred Seventy Eight");
  });

  it("carries paise when present", () => {
    const r = inrFiguresAndWords(1234.5);
    expect(r.figures).toBe("₹1,234.50");
    expect(r.words).toContain("and Fifty Paise");
  });

  it("number-to-words floors to whole rupees", () => {
    expect(numberToWordsIndian(587.5)).toBe("Five Hundred Eighty Seven");
    expect(numberToWordsIndian(0)).toBe("Zero");
  });
});
