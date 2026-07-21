import { describe, it, expect } from "vitest";
import { validateKnowledgeBase } from "../lib/legal/validate";
import { V1_CATALOG } from "../lib/legal/knowledge/v1";
import { getKnowledgeBase } from "../lib/legal/knowledge";

describe("legal knowledge base — v1 self-validation", () => {
  it("passes catalog self-validation with zero issues", () => {
    expect(validateKnowledgeBase(V1_CATALOG)).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = V1_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("attaches a section/rule number ONLY at High confidence", () => {
    for (const r of V1_CATALOG) {
      for (const p of r.provisions) {
        if (p.ref) expect(p.confidence, `${r.id} ${p.ref}`).toBe("High");
      }
    }
  });

  it("excludes superseded instruments from the active knowledge base", () => {
    const active = getKnowledgeBase().all();
    expect(active.every((r) => !r.supersededBy)).toBe(true);
    // SWM: the 2016 rules are superseded; only the 2026 rules are active.
    const swm = active.filter((r) => r.instrument === "Solid Waste Management Rules");
    expect(swm).toHaveLength(1);
    expect(swm[0]?.year).toBe(2026);
    // The 2020 BBMP Act must never be active (superseded by GBGA 2024).
    expect(active.some((r) => r.instrument === "BBMP Act")).toBe(false);
  });

  it("flags a deliberately broken catalog", () => {
    const issues = validateKnowledgeBase([
      {
        id: "bad", instrument: "Fake Act", year: 3000, kind: "Act",
        authorities: [], categories: [], keywords: [], priority: "High", confidence: "High",
        reason: "", provisions: [{ ref: "Section 1", confidence: "Medium", obligation: "x", template: "y" }],
      },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });
});
