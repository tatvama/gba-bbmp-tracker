import { describe, it, expect } from "vitest";
import {
  ROAD_WORK_180,
  ROAD_WORK_180_BY_CODE,
  assertContiguousCodes,
} from "../lib/ai/road-work-questions";

describe("180-question bank", () => {
  it("has exactly 17 sections", () => {
    expect(ROAD_WORK_180.length).toBe(17);
  });

  it("contains exactly Q1..Q180, contiguous, no duplicates", () => {
    expect(() => assertContiguousCodes()).not.toThrow();
    const codes = ROAD_WORK_180.flatMap((s) =>
      s.questions.filter((q) => "code" in q).map((q) => (q as { code: string }).code),
    );
    expect(codes.length).toBe(180);
    expect(new Set(codes).size).toBe(180);
  });

  it("every question carries a valid severity + EN + KN text", () => {
    for (const s of ROAD_WORK_180) {
      for (const q of s.questions) {
        if (!("code" in q)) continue;
        expect(["RED", "ORANGE", "AMBER"]).toContain(q.severity);
        expect(q.en.trim().length).toBeGreaterThan(0);
        expect(q.kn.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("each section declares a legal basis + a Q-range", () => {
    for (const s of ROAD_WORK_180) {
      expect(s.legalBasis.trim().length).toBeGreaterThan(0);
      expect(s.range).toMatch(/^Q\d+-\d+$/);
    }
  });

  it("by-code lookup resolves every code to its section", () => {
    expect(Object.keys(ROAD_WORK_180_BY_CODE).length).toBe(180);
    expect(ROAD_WORK_180_BY_CODE["Q18"]?.section.id).toBe("S2");
    expect(ROAD_WORK_180_BY_CODE["Q180"]?.question.code).toBe("Q180");
    expect(ROAD_WORK_180_BY_CODE["Q153"]?.question.severity).toBe("RED");
  });

  it("assertContiguousCodes throws on a gap", () => {
    const broken = ROAD_WORK_180.map((s) =>
      s.id === "S17" ? { ...s, questions: s.questions.slice(0, -1) } : s,
    );
    expect(() => assertContiguousCodes(broken)).toThrow();
  });
});
